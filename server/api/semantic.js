/**
 * Semantic search over note embeddings (pgvector)
 *
 * The semantic switch is exclusive: when it is on, the text search never runs
 * and tag filters are not applied - the whole query, '#tag' tokens included,
 * is handed to the embedding model as-is.
 */

import { buildEmbeddingPrompt, EmbeddingError, embedText, toVectorLiteral } from "./embed.js";

/**
 * Does this request want the semantic path?
 *
 * Deliberately strict - only "1" (what the frontend sends) or a real boolean
 * true. Anything else stays on the text path, so a malformed flag degrades to
 * the behaviour that always works rather than to a 502.
 *
 * @param {unknown} semanticParam - Raw `semantic` query parameter
 * @returns {boolean} true for the semantic path, false for the text path
 */
export function semanticQueryNeeds(semanticParam) {
  return semanticParam === "1" || semanticParam === true;
}

/**
 * Map a pgvector result row to the shape `db.searchNotes` returns.
 *
 * `rank` mirrors `similarity` so the frontend, which sorts and renders text
 * results by rank, needs no special case for semantic hits.
 *
 * @param {Object} row - Row from the semantic search query
 * @returns {Object} Result in the searchNotes shape, plus `similarity`
 */
export function parseSemanticResults(row) {
  const similarity = Number(row.similarity);
  const score = Number.isFinite(similarity) ? similarity : 0;

  return {
    ...row,
    similarity: score,
    rank: score,
    tags: row.tags ?? [],
  };
}

/**
 * Nearest-neighbour search over the user's note embeddings.
 *
 * Cosine distance (`<=>`), so similarity is `1 - distance`. Archived notes are
 * excluded to match the text search.
 *
 * @param {Object} db - Database client
 * @param {number} userId - Authenticated user id
 * @param {number[]} embedding - Query embedding
 * @param {number} limit - Max results
 * @param {number} offset - Pagination offset
 * @returns {Promise<Object[]>} Results, most similar first
 */
export async function semanticSearch(db, userId, embedding, limit, offset) {
  const result = await db.query(
    `SELECT n.id,
                n.user_id,
                n.title,
                n.content,
                n.content_plain,
                n.is_pinned,
                n.is_archived,
                n.created_at,
                n.updated_at,
                1 - (e.embedding <=> $1::vector) AS similarity,
                ARRAY(
                    SELECT json_build_object('id', t.id, 'name', t.name, 'color', t.color)
                    FROM tags t
                    JOIN note_tags nt ON t.id = nt.tag_id
                    WHERE nt.note_id = n.id
                ) as tags
         FROM note_embeddings e
         JOIN notes n ON n.id = e.note_id
         WHERE e.user_id = $2
           AND NOT n.is_archived
         ORDER BY e.embedding <=> $1::vector
         LIMIT $3 OFFSET $4`,
    [toVectorLiteral(embedding), userId, limit, offset],
  );

  return result.rows.map(parseSemanticResults);
}

/**
 * Embed a note and store the vector, replacing any previous one.
 *
 * @param {Object} db - Database client
 * @param {Object} note - Note to embed
 * @param {number} note.noteId - Note id
 * @param {number} note.userId - Owning user id
 * @param {string} note.title - Note title
 * @param {string} note.content - Note body (plain text preferred)
 * @returns {Promise<boolean>} true when a vector was stored, false for an empty note
 */
export async function upsertNoteEmbedding(db, { noteId, userId, title, content }) {
  const prompt = buildEmbeddingPrompt(title, content);
  if (!prompt) return false;

  const embedding = await embedText(prompt);

  await db.query(
    `INSERT INTO note_embeddings (note_id, user_id, embedding, updated_at)
         VALUES ($1, $2, $3::vector, CURRENT_TIMESTAMP)
         ON CONFLICT (note_id) DO UPDATE
            SET embedding = EXCLUDED.embedding,
                user_id = EXCLUDED.user_id,
                updated_at = CURRENT_TIMESTAMP`,
    [noteId, userId, toVectorLiteral(embedding)],
  );

  return true;
}

/**
 * Refresh a note's embedding without blocking or failing the note write.
 *
 * Fire-and-forget by design: a note must save even when the embedding server
 * is down. The note simply keeps its previous vector (or none) until the
 * backfill script or the next edit catches up.
 *
 * @param {Object} db - Database client
 * @param {Object} note - Same fields as upsertNoteEmbedding
 */
export function queueNoteEmbedding(db, note) {
  upsertNoteEmbedding(db, note).catch((error) => {
    const reason = error instanceof EmbeddingError ? error.message : String(error);
    console.error(`Failed to embed note ${note.noteId}: ${reason}`);
  });
}
