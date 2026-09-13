// src/reseed-sync.ts
// Multi-page synchronizer for TorrentBD reseed requests.
// Handles pagination, deduplication, error tracking, and concurrency guarding.

import { parseReseedPage, type ParsedReseedPage, type ReseedRequestInput } from "./reseed-parser";
import type { ReseedStore } from "./reseed-store";
import { runtimeStatus, type StatusLevel } from "./status";
import { notify } from "./notify";

export interface ReseedSyncDeps {
  baseUrl?: string;
  fetchPage?: (url?: string) => Promise<string>;
  parsePage?: (html: string, baseUrl: string) => ParsedReseedPage;
  store: ReseedStore;
  record?: (level: StatusLevel, message: string) => void;
  now?: () => string;
}

export interface ReseedSynchronizer {
  start(): boolean;
  isRunning(): boolean;
  startPolling(intervalMs?: number): ReturnType<typeof setInterval>;
}

async function defaultFetchPage(url?: string): Promise<string> {
  const { fetchReseedPage } = await import("./tbd-client");
  return fetchReseedPage(url);
}

export async function syncReseedRequests(deps: ReseedSyncDeps): Promise<number> {
  const baseUrl = deps.baseUrl ?? (process.env.TBD_BASE_URL || "https://www.torrentbd.net");
  const fetchPage = deps.fetchPage ?? defaultFetchPage;
  const parsePage = deps.parsePage ?? parseReseedPage;
  const now = deps.now ?? (() => new Date().toISOString());
  const record =
    deps.record ?? ((level: StatusLevel, message: string) => runtimeStatus.record(level, message));

  const startedAt = now();
  deps.store.markRunning(startedAt);

  try {
    const visited = new Set<string>();
    const requestsMap = new Map<string, ReseedRequestInput>();
    let currentUrl: string | null = `${baseUrl.replace(/\/+$/, "")}/reseed-requests.php`;

    while (currentUrl) {
      if (visited.has(currentUrl)) {
        throw new Error("Pagination loop detected");
      }
      visited.add(currentUrl);

      const html = await fetchPage(currentUrl);
      const parsed = parsePage(html, baseUrl);

      for (const req of parsed.requests) {
        if (!requestsMap.has(req.torrentId)) {
          requestsMap.set(req.torrentId, req);
        }
      }

      currentUrl = parsed.nextUrl;
    }

    const completedAt = now();
    const requests = Array.from(requestsMap.values());
    deps.store.replaceSnapshot(requests, completedAt);
    return requests.length;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    deps.store.markFailed(now(), errorMsg);
    record("error", `[reseed-sync] Error: ${errorMsg}`);
    notify(`[TorrentBD] Reseed sync failed: ${errorMsg}`);
    throw err;
  }
}

export function createReseedSynchronizer(deps: ReseedSyncDeps): ReseedSynchronizer {
  let running = false;
  const record =
    deps.record ?? ((level: StatusLevel, message: string) => runtimeStatus.record(level, message));

  function isRunning(): boolean {
    return running;
  }

  function start(): boolean {
    if (running) {
      return false;
    }
    running = true;

    syncReseedRequests(deps)
      .then((count) => {
        record("info", `[reseed-sync] Successfully synchronized ${count} requests`);
      })
      .catch((_err) => {
        // syncReseedRequests already marked store failed, recorded error, and rethrew.
        // Catch here to prevent unhandled promise rejection in background runner.
      })
      .finally(() => {
        running = false;
      });

    return true;
  }

  function startPolling(intervalMs = 300_000): ReturnType<typeof setInterval> {
    start();
    return setInterval(() => {
      start();
    }, intervalMs);
  }

  return {
    start,
    isRunning,
    startPolling,
  };
}
