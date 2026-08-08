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

  /**
   * Delete every session belonging to one user ("log out from all devices").
   *
   * `sessions.data` is TEXT holding JSON like `{"user":{"id":7,...},...}`, so
   * the match is a JSONB containment test. The MATERIALIZED CTE is load-bearing:
   * it forces the cheap `LIKE '{%'` filter to run before any `::jsonb` cast, so
   * a row holding non-object JSON can never abort the whole DELETE.
   * @param {number} userId - Owner of the sessions
   * @returns {Promise<number>} Number of sessions deleted
   */
  async deleteAllSessionsForUser(userId) {
    if (userId === null || userId === undefined) return 0;

    const result = await this.#query(
      `WITH candidates AS MATERIALIZED (
         SELECT id, data FROM sessions WHERE data LIKE '{%'
       )
       DELETE FROM sessions
       WHERE id IN (SELECT id FROM candidates WHERE data::jsonb @> $1::jsonb)
       RETURNING id`,
      [JSON.stringify({ user: { id: userId } })],
    );
    return result.rows.length;
  }

  /**
   * Delete sessions older than maxAgeDays.
   * Returns the number of deleted sessions.
   */
  async deleteExpiredSessions(maxAgeDays = 7) {
    const result = await this.#query(
      `DELETE FROM sessions WHERE created_at < NOW() - INTERVAL '1 day' * $1 RETURNING id`,
      [maxAgeDays],
    );
    return result.rows.length;
  }
}
