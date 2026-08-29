/**
 * Semantic search over note embeddings (pgvector)
 *
 * The semantic switch is exclusive over the *text* search: when it is on, the
 * full-text query never runs and the whole query, '#tag' tokens included, is
 * handed to the embedding model as-is. An explicit `tags` filter is a separate
 * thing and IS honoured - see buildSemanticSearchQuery.
 */

import { buildEmbeddingPrompt, EmbeddingError, embedText, toVectorLiteral } from "./embed.js";

/**
 * Parse the `tags` query parameter into tag ids.
 *
 * Same shape as /api/search/advanced accepts: comma-separated ids. Only
 * positive integers survive - anything else (names, zero, negatives,
 * fractions) can never be a tag id, so it is dropped rather than bound into
 * the query. Duplicates collapse, because the filter counts DISTINCT matches
 * and a repeated id would otherwise make it unsatisfiable.
 *
 * Returning an empty array is not the same as "the caller sent junk": the
 * handler distinguishes the two so a malformed filter is a 400 rather than a
 * silently unfiltered result set.
 *
 * @param {unknown} raw - Raw `tags` query parameter, e.g. "3,5"
 * @returns {number[]} Unique positive tag ids, in the order given
 */
export function parseTagIds(raw) {
  if (typeof raw !== "string") return [];

  const ids = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;

    const id = Number(trimmed);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!ids.includes(id)) ids.push(id);
  }

  return ids;
}

/**
 * Build the nearest-neighbour SQL, optionally narrowed to a tag selection.
 *
 * Pure so the filter construction is unit-testable without a live DB. The tag
 * filter is a WHERE condition on note ids, never a re-ordering: the embedding
 * distance stays the only sort key, so results are (tag-filtered,
 * similarity-ranked). Tags are AND-ed - a note must carry ALL of them, matching
 * how /api/search/advanced and the tag-manager selection behave.
 *
 * @param {Object} spec - Query inputs
 * @param {string} spec.vector - pgvector literal for the query embedding
 * @param {number} spec.userId - Authenticated user id
 * @param {number} spec.limit - Max results
 * @param {number} spec.offset - Pagination offset
 * @param {number[]} [spec.tagIds] - Tag ids the note must all carry
 * @returns {{sql: string, params: unknown[]}} Query and its bound parameters
 */
export function buildSemanticSearchQuery({ vector, userId, limit, offset, tagIds = [] }) {
  const params = [vector, userId, limit, offset];

  // $5/$6 are appended only when there is a filter, so the unfiltered query
  // binds exactly the four parameters it always has.
  let tagFilter = "";
  if (tagIds.length > 0) {
    tagFilter = `
           AND n.id IN (
               SELECT nt.note_id
               FROM note_tags nt
               WHERE nt.tag_id = ANY($5::int[])
               GROUP BY nt.note_id
               HAVING COUNT(DISTINCT nt.tag_id) = $6
           )`;
    params.push(tagIds, tagIds.length);
  }

  const sql = `SELECT n.id,
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
           AND NOT n.is_archived${tagFilter}
         ORDER BY e.embedding <=> $1::vector
         LIMIT $3 OFFSET $4`;

  return { sql, params };
}

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
 * excluded to match the text search. When tag ids are given the results are
 * narrowed to notes carrying all of them, without disturbing the ranking.
 *
 * @param {Object} db - Database client
 * @param {number} userId - Authenticated user id
 * @param {number[]} embedding - Query embedding
 * @param {number} limit - Max results
 * @param {number} offset - Pagination offset
 * @param {number[]} [tagIds] - Tag ids the note must all carry
 * @returns {Promise<Object[]>} Results, most similar first
 */
export async function semanticSearch(db, userId, embedding, limit, offset, tagIds = []) {
  const { sql, params } = buildSemanticSearchQuery({
    vector: toVectorLiteral(embedding),
    userId,
    limit,
    offset,
    tagIds,
  });

  const result = await db.query(sql, params);

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
