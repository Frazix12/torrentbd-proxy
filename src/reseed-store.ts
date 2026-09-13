// src/reseed-store.ts
// SQLite snapshot store for active TorrentBD reseed requests.
// Atomically replaces request snapshot and tracks sync status metadata.
// Removed requests are soft-deleted (removed_at set) for 30 days of history.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ReseedRequestInput } from "./reseed-parser";

export interface ReseedRequest extends ReseedRequestInput {
  lastSeenAt: string;
  removedAt: string | null;
}

export interface ReseedSyncMetadata {
  state: string;
  lastAttemptedSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
}

export interface ReseedStore {
  /** Active (not-removed) requests, newest first. */
  list(): ReseedRequest[];
  /** Recently fulfilled/removed requests, newest first, capped at 100. */
  listHistory(): ReseedRequest[];
  metadata(): ReseedSyncMetadata;
  markRunning(at: string): void;
  replaceSnapshot(requests: ReseedRequestInput[], at: string): void;
  markFailed(at: string, error: string): void;
  close(): void;
}

interface ReseedRequestRow {
  torrent_id: string;
  title: string;
  category: string | null;
  requester: string | null;
  seed_bonus: number | null;
  seed_bonus_text: string | null;
  size_bytes: number | null;
  size_text: string | null;
  seeders: number | null;
  leechers: number | null;
  requested_at: string | null;
  details_url: string;
  details_json: string;
  last_seen_at: string;
  removed_at: string | null;
}

interface ReseedSyncMetaRow {
  state: string;
  last_attempted_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_error: string | null;
}

function safeParseDetails(json: string): Record<string, string> {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // fallback to empty record
  }
  return {};
}

function rowToRequest(row: ReseedRequestRow): ReseedRequest {
  return {
    torrentId: row.torrent_id,
    title: row.title,
    category: row.category ?? null,
    requester: row.requester ?? null,
    seedBonus: row.seed_bonus == null ? null : Number(row.seed_bonus),
    seedBonusText: row.seed_bonus_text ?? null,
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    sizeText: row.size_text ?? null,
    seeders: row.seeders == null ? null : Number(row.seeders),
    leechers: row.leechers == null ? null : Number(row.leechers),
    requestedAt: row.requested_at ?? null,
    detailsUrl: row.details_url,
    details: safeParseDetails(row.details_json),
    lastSeenAt: row.last_seen_at,
    removedAt: row.removed_at ?? null,
  };
}

export function createReseedStore(path: string): ReseedStore {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (dir && dir !== ".") {
      mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(path);

  db.run(`
    CREATE TABLE IF NOT EXISTS reseed_requests (
      torrent_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT,
      requester TEXT,
      seed_bonus REAL,
      seed_bonus_text TEXT,
      size_bytes INTEGER,
      size_text TEXT,
      seeders INTEGER,
      leechers INTEGER,
      requested_at TEXT,
      details_url TEXT NOT NULL,
      details_json TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      removed_at TEXT DEFAULT NULL
    );
  `);

  // Migration: add removed_at to existing DBs that predate soft-delete
  try {
    db.run("ALTER TABLE reseed_requests ADD COLUMN removed_at TEXT DEFAULT NULL");
  } catch {
    // Column already exists — safe to ignore
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS reseed_sync_meta (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      state TEXT NOT NULL,
      last_attempted_sync_at TEXT,
      last_successful_sync_at TEXT,
      last_error TEXT
    );
  `);

  db.run(`
    INSERT OR IGNORE INTO reseed_sync_meta (singleton, state)
    VALUES (1, 'idle');
  `);

  const ACTIVE_COLS = `
    torrent_id, title, category, requester,
    seed_bonus, seed_bonus_text, size_bytes, size_text,
    seeders, leechers, requested_at, details_url, details_json,
    last_seen_at, removed_at
  `;

  const selectActiveStmt = db.prepare(`
    SELECT ${ACTIVE_COLS}
    FROM reseed_requests
    WHERE removed_at IS NULL
    ORDER BY requested_at DESC, torrent_id DESC;
  `);

  const selectHistoryStmt = db.prepare(`
    SELECT ${ACTIVE_COLS}
    FROM reseed_requests
    WHERE removed_at IS NOT NULL
    ORDER BY removed_at DESC
    LIMIT 100;
  `);

  const selectMetaStmt = db.prepare(`
    SELECT
      state,
      last_attempted_sync_at,
      last_successful_sync_at,
      last_error
    FROM reseed_sync_meta
    WHERE singleton = 1;
  `);

  const markRunningStmt = db.prepare(`
    UPDATE reseed_sync_meta
    SET state = 'running',
        last_attempted_sync_at = ?
    WHERE singleton = 1;
  `);

  const markFailedStmt = db.prepare(`
    UPDATE reseed_sync_meta
    SET state = 'error',
        last_attempted_sync_at = ?,
        last_error = ?
    WHERE singleton = 1;
  `);

  const softDeleteMissingStmt = db.prepare(`
    UPDATE reseed_requests
    SET removed_at = ?
    WHERE removed_at IS NULL
      AND torrent_id NOT IN (SELECT value FROM json_each(?));
  `);

  const upsertRequestStmt = db.prepare(`
    INSERT INTO reseed_requests (
      torrent_id, title, category, requester,
      seed_bonus, seed_bonus_text, size_bytes, size_text,
      seeders, leechers, requested_at, details_url, details_json,
      last_seen_at, removed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(torrent_id) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      requester = excluded.requester,
      seed_bonus = excluded.seed_bonus,
      seed_bonus_text = excluded.seed_bonus_text,
      size_bytes = excluded.size_bytes,
      size_text = excluded.size_text,
      seeders = excluded.seeders,
      leechers = excluded.leechers,
      requested_at = excluded.requested_at,
      details_url = excluded.details_url,
      details_json = excluded.details_json,
      last_seen_at = excluded.last_seen_at,
      removed_at = NULL;
  `);

  const updateSuccessMetaStmt = db.prepare(`
    UPDATE reseed_sync_meta
    SET state = 'idle',
        last_attempted_sync_at = COALESCE(last_attempted_sync_at, ?),
        last_successful_sync_at = ?,
        last_error = NULL
    WHERE singleton = 1;
  `);

  const pruneHistoryStmt = db.prepare(`
    DELETE FROM reseed_requests
    WHERE removed_at < datetime('now', '-30 days');
  `);

  const replaceTx = db.transaction(
    (requests: ReseedRequestInput[], at: string) => {
      // Soft-delete anything not in the new snapshot
      const ids = JSON.stringify(requests.map((r) => r.torrentId));
      softDeleteMissingStmt.run(at, ids);

      // Upsert new/existing rows (clears removed_at for re-appeared items)
      for (const req of requests) {
        upsertRequestStmt.run(
          req.torrentId,
          req.title,
          req.category,
          req.requester,
          req.seedBonus,
          req.seedBonusText,
          req.sizeBytes,
          req.sizeText,
          req.seeders,
          req.leechers,
          req.requestedAt,
          req.detailsUrl,
          JSON.stringify(req.details ?? {}),
          at,
        );
      }

      // Prune history older than 30 days
      pruneHistoryStmt.run();

      updateSuccessMetaStmt.run(at, at);
    },
  );

  return {
    list(): ReseedRequest[] {
      return (selectActiveStmt.all() as ReseedRequestRow[]).map(rowToRequest);
    },

    listHistory(): ReseedRequest[] {
      return (selectHistoryStmt.all() as ReseedRequestRow[]).map(rowToRequest);
    },

    metadata(): ReseedSyncMetadata {
      const row = selectMetaStmt.get() as ReseedSyncMetaRow | null | undefined;
      if (!row) {
        return {
          state: "idle",
          lastAttemptedSyncAt: null,
          lastSuccessfulSyncAt: null,
          lastError: null,
        };
      }
      return {
        state: row.state,
        lastAttemptedSyncAt: row.last_attempted_sync_at ?? null,
        lastSuccessfulSyncAt: row.last_successful_sync_at ?? null,
        lastError: row.last_error ?? null,
      };
    },

    markRunning(at: string): void {
      markRunningStmt.run(at);
    },

    replaceSnapshot(requests: ReseedRequestInput[], at: string): void {
      replaceTx(requests, at);
    },

    markFailed(at: string, error: string): void {
      markFailedStmt.run(at, error);
    },

    close(): void {
      db.close();
    },
  };
}
