// src/cache.ts
// SQLite-backed TTL cache for Torznab XML search results.
// Keyed by "${proxyBase}|${query}|${cats}|${page}". Survives container restarts.
// Stale entries are lazily deleted on read and probabilistically pruned on write.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config";

function openDb(path: string): Database {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
  }
  const db = new Database(path);
  db.run(`
    CREATE TABLE IF NOT EXISTS cache (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  return db;
}

const db = openDb(config.cacheDbPath);

const getStmt = db.prepare<{ value: string; expires_at: number }, [string]>(
  "SELECT value, expires_at FROM cache WHERE key = ?",
);
const setStmt = db.prepare(
  "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
);
const deleteStmt = db.prepare("DELETE FROM cache WHERE key = ?");
const pruneStmt = db.prepare("DELETE FROM cache WHERE expires_at < ?");

export const cache = {
  get(key: string): string | undefined {
    const row = getStmt.get(key);
    if (!row) return undefined;
    if (Date.now() > row.expires_at) {
      deleteStmt.run(key);
      return undefined;
    }
    return row.value;
  },

  set(key: string, value: string): void {
    const expiresAt = Date.now() + config.cacheTtlSeconds * 1000;
    setStmt.run(key, value, expiresAt);
    // Probabilistic cleanup ~5% of writes to keep the DB file small
    if (Math.random() < 0.05) pruneStmt.run(Date.now());
  },
};
