/**
 * Custom PostgreSQL session store for oak_sessions.
 * Uses the existing deno-postgres Pool from DatabaseClient.
 */

export class PostgresSessionStore {
  /** @param {import("https://deno.land/x/postgres@v0.17.0/mod.ts").Pool} pool */
  constructor(pool) {
    this.pool = pool;
  }

  /** @param {string} sql @param {Array} params */
  async #query(sql, params = []) {
    const client = await this.pool.connect();
    try {
      return await client.queryObject(sql, params);
    } finally {
      client.release();
    }
  }

  async sessionExists(sessionId) {
    if (!sessionId) return false;
    const result = await this.#query(
      `SELECT 1 FROM sessions WHERE id = $1`,
      [sessionId],
    );
    return result.rows.length > 0;
  }

  async getSessionById(sessionId) {
    if (!sessionId) return null;
    const result = await this.#query(
      `SELECT data FROM sessions WHERE id = $1`,
      [sessionId],
    );
    if (result.rows.length === 0) return null;
    return JSON.parse(result.rows[0].data);
  }

  async createSession(sessionId, initialData) {
    await this.#query(
      `INSERT INTO sessions (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = $2`,
      [sessionId, JSON.stringify(initialData)],
    );
  }

  async persistSessionData(sessionId, sessionData) {
    await this.#query(
      `UPDATE sessions SET data = $1 WHERE id = $2`,
      [JSON.stringify(sessionData), sessionId],
    );
  }

  async deleteSession(sessionId) {
    if (typeof sessionId !== "string") return;
    await this.#query(
      `DELETE FROM sessions WHERE id = $1`,
      [sessionId],
    );
  }
}
