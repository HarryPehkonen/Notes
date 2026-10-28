/**
 * Re-project groff notes whose stored markdown is behind the projection.
 *
 * The projection is a function of the source, the projection code and the house
 * vocabulary, so changing any of the three makes the markdown the app reads
 * stale. This is the script that runs afterwards: for the notes that are behind,
 * it re-derives content_markdown and content_plain, and nothing else.
 *
 * It deliberately does NOT write `title` or `content`. Writing `content` would
 * mean rewriting the source, which is the one thing a derived copy must never
 * do; and writing either would fire the version trigger, filling a note's
 * history with entries its owner never made. A `.RECIPE` title cannot be stale
 * here anyway -- it changed because the source changed, and the save that changed
 * the source already moved the title with it.
 *
 * Semantic search embeds `content_plain`, which this rewrites, so a run makes the
 * embeddings stale too: run scripts/embed-notes.ts afterwards to refresh them.
 *
 * Usage (needs the DB env vars from .env):
 *   deno run --env --allow-net --allow-read --allow-env scripts/reproject-notes.ts
 *   deno run --env --allow-net --allow-read --allow-env scripts/reproject-notes.ts --all
 *
 * Flags:
 *   --all      Re-project every groff note, not just the ones behind
 *   --dry-run  Report what would change, write nothing
 *   --limit N  Stop after N notes (useful as a smoke test)
 */

import { createDatabaseClient, stripMarkdown } from "../server/database/client.js";
import { derivedNoteFields, needsReprojection } from "../server/groff/note-format.js";

type GroffNote = {
  id: number;
  title: string;
  content: string | null;
  format: string;
  projection_version: number | null;
};

/**
 * Groff notes, newest first, capped when a limit is given.
 *
 * The stale filter is applied in JS rather than SQL so that the rule lives in one
 * place, next to the projection it belongs to, and `--all` bypasses it.
 *
 * @param db - Database client
 * @param limit - Max notes to return, 0 for no cap
 */
async function findGroffNotes(
  // deno-lint-ignore no-explicit-any
  db: any,
  limit: number,
): Promise<GroffNote[]> {
  const limitClause = limit > 0 ? `LIMIT ${limit}` : "";
  const result = await db.query(
    `SELECT id, title, content, format, projection_version
     FROM notes
     WHERE format = 'groff' AND NOT is_archived
     ORDER BY updated_at DESC
     ${limitClause}`,
  );
  return result.rows as GroffNote[];
}

/**
 * Entry point
 * @param argv - Raw arguments (typically `Deno.args`)
 * @returns Process exit code
 */
export async function main(argv: string[]): Promise<number> {
  const all = argv.includes("--all");
  const dryRun = argv.includes("--dry-run");
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex >= 0 ? parseInt(argv[limitIndex + 1] ?? "", 10) || 0 : 0;

  const db = createDatabaseClient();
  let projected = 0;
  let warned = 0;

  try {
    const notes = await findGroffNotes(db, limit);
    const stale = all ? notes : notes.filter(needsReprojection);
    console.log(
      `${notes.length} groff note(s), ${stale.length} to re-project` +
        `${all ? " (--all)" : ""}${dryRun ? " (--dry-run)" : ""}`,
    );

    for (const note of stale) {
      const derived = derivedNoteFields({ format: note.format, content: note.content });

      if (derived.warnings.length > 0) {
        warned++;
        console.log(`  #${note.id} projection warnings:`);
        for (const warning of derived.warnings) console.log(`    ${warning}`);
      }

      if (dryRun) {
        console.log(
          `  would re-project #${note.id} ${note.title || "(untitled)"} ` +
            `(projection ${note.projection_version ?? "none"} -> ${derived.projection_version})`,
        );
        projected++;
        continue;
      }

      await db.query(
        `UPDATE notes
         SET content_plain = $1, content_markdown = $2, projection_version = $3
         WHERE id = $4`,
        [
          // The same derivation the save path uses: search reads the plain text
          // of the projection, never of the groff source.
          stripMarkdown(derived.plainSource),
          derived.content_markdown,
          derived.projection_version,
          note.id,
        ],
      );
      projected++;
      console.log(`  re-projected #${note.id} ${note.title || "(untitled)"}`);
    }

    if (!dryRun && projected > 0) {
      console.log(
        "\nEmbeddings and any cached PDFs are now stale for these notes: " +
          "run scripts/embed-notes.ts to refresh semantic search.",
      );
    }
    console.log(
      `Done: ${projected} projected, ${notes.length - stale.length} already current` +
        `${warned > 0 ? `, ${warned} with projection warnings` : ""}`,
    );
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
