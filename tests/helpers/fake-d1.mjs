// A minimal, zero-dependency stand-in for Cloudflare's D1Database, backed
// by Node's built-in node:sqlite (D1 is SQLite under the hood, so this runs
// the real SQL, not a reimplementation of it). Implements just the surface
// src/lib/db.ts actually calls: prepare(sql).bind(...args).first()/.run()/.all().
// Used only by these tests — never shipped, never touches the real app.
import { DatabaseSync } from "node:sqlite";

function makeStatement(db, query, params) {
  return {
    bind(...newParams) {
      return makeStatement(db, query, newParams);
    },
    async first() {
      const row = db.prepare(query).get(...params);
      return row ?? null;
    },
    async run() {
      const info = db.prepare(query).run(...params);
      return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
    },
    async all() {
      const results = db.prepare(query).all(...params);
      return { results, success: true, meta: {} };
    },
  };
}

/** `schemaSql` is the CREATE TABLE / CREATE INDEX statements to apply before
 *  the test runs — usually copied straight from the relevant migration(s),
 *  kept minimal to just what the test under it needs. */
export function createFakeD1(schemaSql) {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaSql);
  return {
    prepare(query) {
      return makeStatement(db, query, []);
    },
  };
}
