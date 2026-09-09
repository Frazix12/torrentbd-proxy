// src/reseed-store.ts
// SQLite snapshot store for active TorrentBD reseed requests.
// Atomically replaces request snapshot and tracks sync status metadata.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ReseedRequestInput } from "./reseed-parser";

export interface ReseedRequest extends ReseedRequestInput {
  lastSeenAt: string;
}

export interface ReseedSyncMetadata {
  state: string;
  lastAttemptedSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
}

export interface ReseedStore {
  list(): ReseedRequest[];
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
      last_seen_at TEXT NOT NULL
    );
  `);

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

  const selectRequestsStmt = db.prepare(`
    SELECT
      torrent_id,
      title,
      category,
      requester,
      seed_bonus,
      seed_bonus_text,
      size_bytes,
      size_text,
      seeders,
      leechers,
      requested_at,
      details_url,
      details_json,
      last_seen_at
    FROM reseed_requests
    ORDER BY requested_at DESC, torrent_id DESC;
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

  const deleteAllRequestsStmt = db.prepare(`
    DELETE FROM reseed_requests;
  `);

  const insertRequestStmt = db.prepare(`
    INSERT INTO reseed_requests (
      torrent_id,
      title,
      category,
      requester,
      seed_bonus,
      seed_bonus_text,
      size_bytes,
      size_text,
      seeders,
      leechers,
      requested_at,
      details_url,
      details_json,
      last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const updateSuccessMetaStmt = db.prepare(`
    UPDATE reseed_sync_meta
    SET state = 'idle',
        last_attempted_sync_at = COALESCE(last_attempted_sync_at, ?),
        last_successful_sync_at = ?,
        last_error = NULL
    WHERE singleton = 1;
  `);

  const replaceTx = db.transaction((requests: ReseedRequestInput[], at: string) => {
    deleteAllRequestsStmt.run();
    for (const req of requests) {
      insertRequestStmt.run(
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
    updateSuccessMetaStmt.run(at, at);
  });

  return {
    list(): ReseedRequest[] {
      const rows = selectRequestsStmt.all() as ReseedRequestRow[];
      return rows.map((row) => ({
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
      }));
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
