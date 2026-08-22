/**
 * Backfill note embeddings for semantic search
 *
 * Embeds every note that has no vector yet, plus every note edited since its
 * vector was written, and upserts into note_embeddings. Idempotent: a second
 * run with no edits in between does nothing.
 *
 * Usage (needs the DB env vars from .env and a reachable embedding server):
 *   deno run --env --allow-net --allow-read --allow-env scripts/embed-notes.ts
 *   deno run --env --allow-net --allow-read --allow-env scripts/embed-notes.ts --all
 *
 * Flags:
 *   --all     Re-embed every note, not just stale ones
 *   --limit N Stop after N notes (useful for a first smoke test)
 */

import { createDatabaseClient } from "../server/database/client.js";
import { EmbeddingError } from "../server/api/embed.js";
import { upsertNoteEmbedding } from "../server/api/semantic.js";

type StaleNote = {
  id: number;
  user_id: number;
  title: string;
  content_plain: string | null;
};

/**
 * Notes whose embedding is missing or older than the note itself
 * @param db - Database client
 * @param all - Re-embed everything instead of just stale notes
 * @param limit - Max notes to return, 0 for no cap
 */
async function findNotesToEmbed(
  // deno-lint-ignore no-explicit-any
  db: any,
  all: boolean,
  limit: number,
): Promise<StaleNote[]> {
  const staleFilter = all ? "" : "AND (e.note_id IS NULL OR e.updated_at < n.updated_at)";
  const limitClause = limit > 0 ? `LIMIT ${limit}` : "";

  const result = await db.query(
    `SELECT n.id, n.user_id, n.title, n.content_plain
     FROM notes n
     LEFT JOIN note_embeddings e ON e.note_id = n.id
     WHERE NOT n.is_archived
     ${staleFilter}
     ORDER BY n.updated_at DESC
     ${limitClause}`,
  );

  return result.rows as StaleNote[];
}

/**
 * Entry point
 * @param argv - Raw arguments (typically `Deno.args`)
 * @returns Process exit code
 */
export async function main(argv: string[]): Promise<number> {
  const all = argv.includes("--all");
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex >= 0 ? parseInt(argv[limitIndex + 1] ?? "", 10) || 0 : 0;

  const db = createDatabaseClient();
  let embedded = 0;
  let skipped = 0;

  try {
    const notes = await findNotesToEmbed(db, all, limit);
    console.log(`${notes.length} note(s) to embed${all ? " (--all)" : ""}`);

    for (const note of notes) {
      try {
        const stored = await upsertNoteEmbedding(db, {
          noteId: note.id,
          userId: note.user_id,
          title: note.title,
          content: note.content_plain ?? "",
        });

        if (stored) {
          embedded++;
          console.log(`  embedded #${note.id} ${note.title || "(untitled)"}`);
        } else {
          skipped++;
          console.log(`  skipped #${note.id} (empty note)`);
        }
      } catch (error) {
        if (error instanceof EmbeddingError) {
          // The embedding server is the shared dependency - if it is down,
          // every remaining note will fail the same way
          console.error(`Embedding server error on note #${note.id}: ${error.message}`);
          return 1;
        }
        throw error;
      }
    }

    console.log(`Done: ${embedded} embedded, ${skipped} skipped`);
    return 0;
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    return 1;
  } finally {
    await db.close();
  }
}

if (import.meta.main) {
  Deno.exit(await main(Deno.args));
}
