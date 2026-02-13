import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { parsePostgreSQLStatements } from "../../server/database/client.js";

Deno.test("sql parser: parses simple statements", () => {
  const sql = "CREATE TABLE foo (id int);\nCREATE TABLE bar (id int);";
  const result = parsePostgreSQLStatements(sql);
  assertEquals(result.length, 2);
  assertEquals(result[0], "CREATE TABLE foo (id int);");
  assertEquals(result[1], "CREATE TABLE bar (id int);");
});

Deno.test("sql parser: handles dollar-quoted strings", () => {
  const sql = `CREATE OR REPLACE FUNCTION test() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;`;
  const result = parsePostgreSQLStatements(sql);
  assertEquals(result.length, 1);
  // The function body should be intact with the semicolons inside
  assertEquals(result[0].includes("NEW.updated_at = NOW();"), true);
});

Deno.test("sql parser: preserves semicolons inside dollar quotes", () => {
  const sql = `CREATE OR REPLACE FUNCTION multi() RETURNS void AS $$
BEGIN
  INSERT INTO log VALUES ('a');
  INSERT INTO log VALUES ('b');
END;
$$ LANGUAGE plpgsql;
CREATE TABLE after_func (id int);`;
  const result = parsePostgreSQLStatements(sql);
  // Should produce exactly 2 statements (function + table), not split on internal semicolons
  assertEquals(result.length, 2);
});

Deno.test("sql parser: handles named dollar quotes", () => {
  const sql = `CREATE OR REPLACE FUNCTION test() RETURNS trigger AS $fn$
BEGIN
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;`;
  const result = parsePostgreSQLStatements(sql);
  assertEquals(result.length, 1);
  assertEquals(result[0].includes("$fn$"), true);
});

Deno.test("sql parser: removes single-line comments", () => {
  const sql = `-- This is a comment
CREATE TABLE foo (id int);
-- Another comment
CREATE TABLE bar (id int);`;
  const result = parsePostgreSQLStatements(sql);
  assertEquals(result.length, 2);
});

Deno.test("sql parser: orders statements correctly", () => {
  const sql = `CREATE TABLE users (id int);
CREATE INDEX idx_users ON users (id);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DROP TABLE IF EXISTS old_table;
CREATE OR REPLACE FUNCTION update_ts() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_update BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_ts();`;

  const result = parsePostgreSQLStatements(sql);

  // Verify ordering: DROP -> EXTENSION -> TABLE -> FUNCTION -> INDEX -> TRIGGER
  const dropIdx = result.findIndex((s: string) => s.startsWith("DROP"));
  const extIdx = result.findIndex((s: string) => s.startsWith("CREATE EXTENSION"));
  const tableIdx = result.findIndex((s: string) => s.startsWith("CREATE TABLE"));
  const funcIdx = result.findIndex((s: string) => s.includes("CREATE OR REPLACE FUNCTION"));
  const indexIdx = result.findIndex((s: string) => s.startsWith("CREATE INDEX"));
  const triggerIdx = result.findIndex((s: string) => s.startsWith("CREATE TRIGGER"));

  assertEquals(dropIdx < extIdx, true, "DROP before EXTENSION");
  assertEquals(extIdx < tableIdx, true, "EXTENSION before TABLE");
  assertEquals(tableIdx < funcIdx, true, "TABLE before FUNCTION");
  assertEquals(funcIdx < indexIdx, true, "FUNCTION before INDEX");
  assertEquals(indexIdx < triggerIdx, true, "INDEX before TRIGGER");
});

Deno.test("sql parser: filters out non-schema statements", () => {
  const sql = `SELECT * FROM foo;
INSERT INTO bar VALUES (1);
CREATE TABLE baz (id int);`;
  const result = parsePostgreSQLStatements(sql);
  // SELECT and INSERT don't match the keyword filter
  assertEquals(result.length, 1);
  assertEquals(result[0].includes("CREATE TABLE baz"), true);
});

Deno.test("sql parser: handles empty input", () => {
  assertEquals(parsePostgreSQLStatements("").length, 0);
  assertEquals(parsePostgreSQLStatements("-- just a comment").length, 0);
});

Deno.test("sql parser: handles ALTER statements", () => {
  const sql = "ALTER TABLE users ADD COLUMN email text;";
  const result = parsePostgreSQLStatements(sql);
  assertEquals(result.length, 1);
});

Deno.test("sql parser: handles GRANT statements", () => {
  const sql = "GRANT ALL ON users TO app_user;";
  const result = parsePostgreSQLStatements(sql);
  assertEquals(result.length, 1);
});
