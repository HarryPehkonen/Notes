/**
 * CLI for managing personal API tokens
 *
 * Usage (see deno.json tasks):
 *   deno task token:create --email you@example.com --name hermes
 *   deno task token:list [--email you@example.com]
 *   deno task token:revoke --name hermes [--email you@example.com]
 *
 * Only the SHA-256 digest of a token is stored. The plaintext is printed once,
 * at creation, and is never written to a file or log.
 */

import { createDatabaseClient } from "../database/client.js";
import { generateApiToken } from "../auth/api-tokens.js";
import { parseTokenArgs } from "./args.js";

const USAGE = `Manage personal API tokens for machine clients.

Usage:
  deno task token:create --email <email> --name <name>
  deno task token:list [--email <email>]
  deno task token:revoke --name <name> [--email <email>]

Commands:
  create   Create a token for the user with the given email. The plaintext
           token is printed once and cannot be retrieved again.
  list     Show tokens (id, name, created, last used, revoked). Never shows
           token values. Without --email, lists tokens for all users.
  revoke   Revoke the named token. Idempotent. Without --email, the name must
           be unambiguous across users.

Flags:
  --email <email>   User's email address
  --name <name>     Token name (unique per user)
  -h, --help        Show this help
`;

/**
 * Look up a user by email
 * @param {DatabaseClient} db - Database client
 * @param {string} email - Email address
 * @returns {Promise<Object>} User row with id and email
 */
async function requireUser(db, email) {
  const result = await db.query("SELECT id, email FROM users WHERE email = $1", [email]);
  const user = result.rows[0];
  if (!user) throw new Error(`No user found with email: ${email}`);
  return user;
}

/**
 * Format a timestamp for CLI output
 * @param {Date|null} value - Timestamp or null
 * @returns {string} ISO string, or "-" when unset
 */
function formatTimestamp(value) {
  return value ? new Date(value).toISOString() : "-";
}

/**
 * Create a token and print the plaintext exactly once
 * @param {DatabaseClient} db - Database client
 * @param {{ email: string, name: string }} args - Parsed arguments
 * @returns {Promise<void>}
 */
async function createToken(db, args) {
  const user = await requireUser(db, args.email);
  const token = generateApiToken();

  try {
    await db.query(
      `INSERT INTO api_tokens (user_id, name, token_hash)
       VALUES ($1, $2, digest($3, 'sha256'))`,
      [user.id, args.name, token],
    );
  } catch (error) {
    // Unique constraint violation (PostgreSQL error code 23505)
    if (error.fields?.code === "23505" || error.message.includes("duplicate key")) {
      throw new Error(
        `A token named "${args.name}" already exists for ${user.email} ` +
          `(revoked tokens keep their name). Pick a different --name.`,
      );
    }
    throw error;
  }

  console.log(`Created token "${args.name}" for ${user.email}`);
  console.log(`Your API token (shown once, store securely): ${token}`);
}

/**
 * List tokens, optionally scoped to one user
 * @param {DatabaseClient} db - Database client
 * @param {{ email: string|null }} args - Parsed arguments
 * @returns {Promise<void>}
 */
async function listTokens(db, args) {
  const user = args.email ? await requireUser(db, args.email) : null;

  const result = await db.query(
    `SELECT t.id, t.name, u.email, t.created_at, t.last_used_at, t.revoked_at
     FROM api_tokens t
     JOIN users u ON u.id = t.user_id
     ${user ? "WHERE t.user_id = $1" : ""}
     ORDER BY u.email, t.created_at`,
    user ? [user.id] : [],
  );

  if (result.rows.length === 0) {
    console.log(user ? `No tokens for ${user.email}` : "No tokens");
    return;
  }

  for (const row of result.rows) {
    console.log(
      [
        `id=${row.id}`,
        `email=${row.email}`,
        `name=${row.name}`,
        `created=${formatTimestamp(row.created_at)}`,
        `last_used=${formatTimestamp(row.last_used_at)}`,
        `revoked=${formatTimestamp(row.revoked_at)}`,
      ].join("  "),
    );
  }
}

/**
 * Revoke a token by name (idempotent)
 * @param {DatabaseClient} db - Database client
 * @param {{ email: string|null, name: string }} args - Parsed arguments
 * @returns {Promise<void>}
 */
async function revokeToken(db, args) {
  const user = args.email ? await requireUser(db, args.email) : null;

  const matches = await db.query(
    `SELECT t.id, t.revoked_at, u.email
     FROM api_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.name = $1${user ? " AND t.user_id = $2" : ""}`,
    user ? [args.name, user.id] : [args.name],
  );

  if (matches.rows.length === 0) {
    throw new Error(
      user ? `No token named "${args.name}" for ${user.email}` : `No token named "${args.name}"`,
    );
  }

  if (matches.rows.length > 1) {
    const emails = matches.rows.map((row) => row.email).join(", ");
    throw new Error(
      `"${args.name}" matches tokens for multiple users (${emails}). Specify --email.`,
    );
  }

  const [token] = matches.rows;
  if (token.revoked_at) {
    console.log(`Token "${args.name}" for ${token.email} was already revoked`);
    return;
  }

  await db.query(
    "UPDATE api_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND revoked_at IS NULL",
    [token.id],
  );
  console.log(`Revoked token "${args.name}" for ${token.email}`);
}

/**
 * CLI entry point
 * @param {string[]} argv - Raw arguments (typically `Deno.args`)
 * @returns {Promise<number>} Process exit code
 */
export async function main(argv) {
  const args = parseTokenArgs(argv);

  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  if (args.error) {
    console.error(`Error: ${args.error}\n`);
    console.error(USAGE);
    return 1;
  }

  const db = createDatabaseClient();
  try {
    if (args.command === "create") await createToken(db, args);
    if (args.command === "list") await listTokens(db, args);
    if (args.command === "revoke") await revokeToken(db, args);
    return 0;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return 1;
  } finally {
    await db.close();
  }
}

if (import.meta.main) {
  Deno.exit(await main(Deno.args));
}
