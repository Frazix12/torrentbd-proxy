# Reseed Requests Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every active TorrentBD reseed request and expose it on a searchable, filterable LAN dashboard with bonus, metadata, download, and original-page links.

**Architecture:** A generic table parser preserves every upstream-visible field while normalizing fields needed for filters. A guarded five-minute synchronizer fetches every page and atomically replaces a Bun SQLite snapshot; Hono serves snapshot JSON and a static browser UI that filters locally.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, Hono, Cheerio, Bun test, plain browser JavaScript

**Spec:** `docs/superpowers/specs/2026-09-08-reseed-dashboard-design.md`

## Global Constraints

- Start implementation in an isolated worktree from commit `8710ce9`; the current main worktree has unrelated uncommitted source changes that must not be staged, overwritten, or imported accidentally.
- Scrape `https://www.torrentbd.net/reseed-requests.php` through the existing authenticated session.
- Synchronize once at startup and every 300,000 ms; permit only one sync at a time.
- Replace the snapshot only after every pagination page parses successfully.
- Delete requests absent from a successful sync; retain the last good snapshot after any failed sync.
- Keep `/reseed`, `/reseed-data`, `/reseed-download`, and `/reseed-refresh` open on the trusted LAN like `/`.
- Never expose `PROXY_API_KEY`, TorrentBD credentials, or cookies in dashboard HTML, JSON, links, browser history, or logs.
- Use Bun's built-in SQLite; add no runtime dependency.
- Render scraped strings with DOM text APIs, never `innerHTML`.
- Treat every upstream-visible table column as displayable metadata, even when it has no normalized field.

---

## File Map

**Create:**

- `src/reseed-parser.ts` — normalized request type and generic upstream table/pagination parser.
- `src/reseed-store.ts` — SQLite schema, atomic snapshot replacement, and sync metadata.
- `src/reseed-sync.ts` — multi-page aggregation, deduplication, refresh guard, and timer.
- `src/reseed-dashboard.ts` — static `/reseed` page shell.
- `src/reseed-ui.js` — browser filtering, sorting, safe table rendering, and refresh behavior.
- `src/test/reseed-parser.test.ts` — parser, metadata preservation, empty state, and pagination tests.
- `src/test/reseed-store.test.ts` — replacement/deletion and failure-metadata tests.
- `src/test/reseed-sync.test.ts` — pagination, deduplication, failure preservation, and concurrency tests.
- `src/test/reseed-dashboard.test.ts` — page controls and route-safe link tests.
- `src/test/reseed-ui.test.ts` — pure browser-filter and sort tests.

**Modify:**

- `src/config.ts` — persistent reseed database path.
- `src/tbd-client.ts` — authenticated reseed page GET.
- `src/index.ts` — reseed dependencies, routes, download proxy, and production startup.
- `src/dashboard.ts` — navigation link to `/reseed`.
- `src/test/dashboard.test.ts` — navigation assertion.
- `.env.example` — optional `RESEED_DB_PATH` documentation.
- `README.md` — routes, persistence, and synchronization behavior.

---

### Task 1: Parse and Normalize Reseed Pages

**Files:**

- Create: `src/reseed-parser.ts`
- Create: `src/test/reseed-parser.test.ts`

**Interfaces:**

- Produces: `ReseedRequestInput`, containing normalized fields plus `details: Record<string, string>`.
- Produces: `parseReseedPage(html: string, baseUrl: string): ParsedReseedPage`.
- `ParsedReseedPage` is `{ requests: ReseedRequestInput[]; nextUrl: string | null; recognizedEmpty: boolean }`.
- Throws `Error` for login HTML, unrecognized markup, invalid cross-origin pagination, or rows without numeric torrent IDs.

- [ ] **Step 1: Write parser tests with representative generic table fixtures**

```ts
import { describe, expect, it } from "bun:test";
import { parseReseedPage } from "../reseed-parser";

const page = `
<table class="reseed-list">
  <thead><tr>
    <th>Torrent</th><th>Category</th><th>Requested By</th>
    <th>Seed Bonus</th><th>Size</th><th>Seeders</th>
    <th>Leechers</th><th>Requested</th><th>Reason</th>
  </tr></thead>
  <tbody><tr>
    <td><a href="/torrents-details.php?id=42">Ubuntu Archive</a></td>
    <td>Software</td><td>Alice</td><td>1,500 points</td>
    <td>2.5 GiB</td><td>0</td><td>3</td><td>2026-09-07</td>
    <td>Please reseed</td>
  </tr></tbody>
</table>
<a rel="next" href="/reseed-requests.php?page=2">Next</a>`;

describe("parseReseedPage", () => {
  it("normalizes filter fields and preserves every visible column", () => {
    const result = parseReseedPage(page, "https://www.torrentbd.net");
    expect(result.requests).toEqual([expect.objectContaining({
      torrentId: "42",
      title: "Ubuntu Archive",
      category: "Software",
      requester: "Alice",
      seedBonus: 1500,
      seedBonusText: "1,500 points",
      sizeBytes: 2684354560,
      sizeText: "2.5 GiB",
      seeders: 0,
      leechers: 3,
      requestedAt: "2026-09-07",
      detailsUrl: "https://www.torrentbd.net/torrents-details.php?id=42",
      details: { Reason: "Please reseed" },
    })]);
    expect(result.nextUrl).toBe("https://www.torrentbd.net/reseed-requests.php?page=2");
  });

  it("recognizes a valid empty table", () => {
    const html = `<table><thead><tr><th>Torrent</th><th>Seed Bonus</th></tr></thead><tbody></tbody></table>`;
    expect(parseReseedPage(html, "https://www.torrentbd.net")).toEqual({
      requests: [], nextUrl: null, recognizedEmpty: true,
    });
  });

  it("rejects login and unrelated HTML", () => {
    expect(() => parseReseedPage(`<form action="takelogin.php"></form>`, "https://www.torrentbd.net")).toThrow();
    expect(() => parseReseedPage(`<h1>Maintenance</h1>`, "https://www.torrentbd.net")).toThrow();
  });

  it("rejects pagination outside the configured origin", () => {
    const html = page.replace("/reseed-requests.php?page=2", "https://evil.example/page=2");
    expect(() => parseReseedPage(html, "https://www.torrentbd.net")).toThrow("pagination origin");
  });
});
```

- [ ] **Step 2: Run the parser tests and verify they fail**

Run: `bun test src/test/reseed-parser.test.ts`

Expected: FAIL because `src/reseed-parser.ts` does not exist.

- [ ] **Step 3: Implement the normalized model and generic table parser**

```ts
export interface ReseedRequestInput {
  torrentId: string;
  title: string;
  category: string | null;
  requester: string | null;
  seedBonus: number | null;
  seedBonusText: string | null;
  sizeBytes: number | null;
  sizeText: string | null;
  seeders: number | null;
  leechers: number | null;
  requestedAt: string | null;
  detailsUrl: string;
  details: Record<string, string>;
}

export interface ParsedReseedPage {
  requests: ReseedRequestInput[];
  nextUrl: string | null;
  recognizedEmpty: boolean;
}
```

Implement with Cheerio using these rules:

1. Normalize each `<th>` with collapsed whitespace and lowercase aliases.
2. Select the first table containing both a torrent/title header and a bonus header.
3. Map every `<td>` by its header label.
4. Find the details link whose URL contains `torrents-details` and extract `id` with `URL.searchParams`.
5. Normalize known aliases (`torrent|title`, `requested by|requester`, `seed bonus|bonus`, `requested|request date|age`, `size`, `seeders`, `leechers`). For the requested date, prefer the cell's machine-readable `title` attribute over age text so date filters remain stable.
6. Put non-normalized, non-empty columns into `details` with their original header text.
7. Parse comma-formatted numeric values with one shared helper and binary size units with one shared helper.
8. Resolve `rel=next` first, then a reseed-page anchor whose text is `Next`; require the configured origin and `/reseed-requests.php` pathname.
9. Return `recognizedEmpty: true` only when the recognized table has no data rows.

- [ ] **Step 4: Run parser tests and type checking**

Run: `bun test src/test/reseed-parser.test.ts && bunx tsc --noEmit`

Expected: all parser tests PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit the parser**

```bash
git add src/reseed-parser.ts src/test/reseed-parser.test.ts
git commit -m "feat(reseed): parse request pages"
```

---

### Task 2: Fetch Authenticated Reseed Pages

**Files:**

- Modify: `src/tbd-client.ts`
- Create: `src/test/reseed-client.test.ts`

**Interfaces:**

- Consumes: existing `getSessionHeaders()` and `invalidateSession()`.
- Produces: `fetchReseedPage(url?: string, attempt?: number): Promise<string>`.
- The default URL is `${config.tbdBaseUrl}/reseed-requests.php`.

- [ ] **Step 1: Write failing client tests**

Use `mock.module("../session", ...)` before dynamically importing `../tbd-client`. Stub `globalThis.fetch` and assert:

```ts
expect(fetch).toHaveBeenCalledWith(
  "https://www.torrentbd.net/reseed-requests.php?page=2",
  expect.objectContaining({
    method: "GET",
    headers: expect.objectContaining({ Cookie: "sid=test" }),
    redirect: "follow",
  }),
);
```

Cover three cases: successful HTML, one invalidation/retry after a login redirect, and rejection of `https://evil.example/reseed-requests.php` before `fetch` is called.

- [ ] **Step 2: Run the client tests and verify they fail**

Run: `bun test src/test/reseed-client.test.ts`

Expected: FAIL because `fetchReseedPage` is not exported.

- [ ] **Step 3: Add the minimum authenticated GET implementation**

```ts
export async function fetchReseedPage(
  url = `${BASE}/reseed-requests.php`,
  attempt = 0,
): Promise<string> {
  const target = new URL(url, BASE);
  if (target.origin !== new URL(BASE).origin || target.pathname !== "/reseed-requests.php") {
    throw new Error("Invalid reseed page URL");
  }

  const headers = await getSessionHeaders();
  const response = await fetch(target.href, {
    method: "GET",
    headers: { ...headers, Referer: `${BASE}/reseed-requests.php` },
    redirect: "follow",
  });
  const html = await response.text();

  if (isLoginRedirect(html, response.url) && attempt === 0) {
    invalidateSession();
    return fetchReseedPage(target.href, 1);
  }
  if (!response.ok || isLoginRedirect(html, response.url)) {
    throw new Error(`Reseed page failed: HTTP ${response.status}`);
  }
  return html;
}
```

Reuse the existing login/challenge detection present in the execution branch; do not create a second competing helper if the pre-existing uncommitted work has since been committed.

- [ ] **Step 4: Run client and existing tests**

Run: `bun test src/test/reseed-client.test.ts src/test/session.test.ts src/test/torznab.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit the client**

```bash
git add src/tbd-client.ts src/test/reseed-client.test.ts
git commit -m "feat(reseed): fetch authenticated pages"
```

---

### Task 3: Persist an Atomic Current Snapshot

**Files:**

- Modify: `src/config.ts`
- Create: `src/reseed-store.ts`
- Create: `src/test/reseed-store.test.ts`

**Interfaces:**

- Consumes: `ReseedRequestInput` from `src/reseed-parser.ts`.
- Produces: `ReseedRequest extends ReseedRequestInput` with `lastSeenAt: string`.
- Produces: `createReseedStore(path: string)` with `list()`, `metadata()`, `markRunning(at)`, `replaceSnapshot(requests, at)`, `markFailed(at, error)`, and `close()`.
- Produces: `config.reseedDbPath`, defaulting to `:memory:` in tests and `${config.cloakProfileDir}/reseed.sqlite` otherwise.

- [ ] **Step 1: Write failing store tests using an in-memory database**

```ts
import { afterEach, describe, expect, it } from "bun:test";
import { createReseedStore } from "../reseed-store";

const first = {
  torrentId: "42", title: "One", category: "TV", requester: "Alice",
  seedBonus: 100, seedBonusText: "100", sizeBytes: 1024, sizeText: "1 KiB",
  seeders: 0, leechers: 1, requestedAt: "2026-09-01",
  detailsUrl: "https://www.torrentbd.net/torrents-details.php?id=42",
  details: { Reason: "Needed" },
};

describe("reseed store", () => {
  it("atomically replaces and deletes missing requests", () => {
    const store = createReseedStore(":memory:");
    store.replaceSnapshot([first, { ...first, torrentId: "43", title: "Two" }], "2026-09-08T00:00:00Z");
    store.replaceSnapshot([{ ...first, title: "Updated" }], "2026-09-08T00:05:00Z");
    expect(store.list().map((item) => item.torrentId)).toEqual(["42"]);
    expect(store.list()[0].title).toBe("Updated");
    expect(store.metadata().lastSuccessfulSyncAt).toBe("2026-09-08T00:05:00Z");
    store.close();
  });

  it("records failure without changing requests", () => {
    const store = createReseedStore(":memory:");
    store.replaceSnapshot([first], "2026-09-08T00:00:00Z");
    store.markFailed("2026-09-08T00:05:00Z", "network down");
    expect(store.list()).toHaveLength(1);
    expect(store.metadata()).toEqual(expect.objectContaining({ state: "error", lastError: "network down" }));
    store.close();
  });
});
```

- [ ] **Step 2: Run store tests and verify they fail**

Run: `bun test src/test/reseed-store.test.ts`

Expected: FAIL because the store module does not exist.

- [ ] **Step 3: Implement the SQLite schema and store**

Use `Database` from `bun:sqlite`. Create:

```sql
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
CREATE TABLE IF NOT EXISTS reseed_sync_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  state TEXT NOT NULL,
  last_attempted_sync_at TEXT,
  last_successful_sync_at TEXT,
  last_error TEXT
);
```

Initialize the metadata singleton with `INSERT OR IGNORE INTO reseed_sync_meta (singleton, state) VALUES (1, 'idle')`. Prepare insert/select/update statements once. Wrap `DELETE FROM reseed_requests`, all inserts, and success metadata update in one `db.transaction(...)`. Serialize `details` with `JSON.stringify` and parse it on reads. Sort `list()` by `requested_at DESC, torrent_id DESC` for deterministic output.

- [ ] **Step 4: Add the database path to configuration**

Compute `cloakProfileDir` once before the config object, then add:

```ts
reseedDbPath:
  process.env.RESEED_DB_PATH ??
  (process.env.NODE_ENV === "test"
    ? ":memory:"
    : `${cloakProfileDir}/reseed.sqlite`),
```

- [ ] **Step 5: Run store tests and type checking**

Run: `bun test src/test/reseed-store.test.ts src/test/config.test.ts && bunx tsc --noEmit`

Expected: all tests PASS with no type errors.

- [ ] **Step 6: Commit storage**

```bash
git add src/config.ts src/reseed-store.ts src/test/reseed-store.test.ts
git commit -m "feat(reseed): persist current snapshot"
```

---

### Task 4: Synchronize Every Page Safely

**Files:**

- Create: `src/reseed-sync.ts`
- Create: `src/test/reseed-sync.test.ts`

**Interfaces:**

- Consumes: `fetchReseedPage(url)`, `parseReseedPage(html, baseUrl)`, reseed store, and `runtimeStatus.record(level, message)`.
- Produces: `syncReseedRequests(deps): Promise<number>` returning the saved request count.
- Produces: `createReseedSynchronizer(deps)` with `start(): boolean`, `isRunning(): boolean`, and `startPolling(intervalMs?: number): ReturnType<typeof setInterval>`.

- [ ] **Step 1: Write failing aggregation tests**

Build two HTML pages using the Task 1 table fixture. Stub `fetchPage` with a URL-to-HTML map and use an in-memory store. Assert:

```ts
const count = await syncReseedRequests({
  baseUrl: "https://www.torrentbd.net",
  fetchPage,
  store,
  record: () => {},
  now: () => "2026-09-08T00:00:00Z",
});
expect(count).toBe(2);
expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([
  "https://www.torrentbd.net/reseed-requests.php",
  "https://www.torrentbd.net/reseed-requests.php?page=2",
]);
expect(store.list().map((item) => item.torrentId)).toEqual(["43", "42"]);
```

Also test that duplicate ID `42` on page two remains one row, a repeated next URL throws `Pagination loop detected`, and a page-two failure leaves a preloaded store snapshot untouched.

- [ ] **Step 2: Write the failing refresh-guard test**

Use a deferred `fetchPage` promise. Call `start()` twice before resolving it and assert the first result is `true`, the second is `false`, and only one fetch occurs.

- [ ] **Step 3: Run sync tests and verify they fail**

Run: `bun test src/test/reseed-sync.test.ts`

Expected: FAIL because the synchronizer module does not exist.

- [ ] **Step 4: Implement complete multi-page synchronization**

`syncReseedRequests` must:

1. Call `store.markRunning(now())`.
2. Begin at `${baseUrl}/reseed-requests.php`.
3. Track visited URLs in a `Set<string>` and reject repeats.
4. Parse every fetched page before modifying SQLite.
5. Deduplicate with `Map<string, ReseedRequestInput>`.
6. Call `store.replaceSnapshot([...requests.values()], now())` only after pagination ends.
7. On error, call `store.markFailed(now(), String(error))`, record one error event, and rethrow.

`createReseedSynchronizer.start()` synchronously claims the guard, launches `syncReseedRequests`, records success, and clears the guard in `.finally()`. `startPolling(300_000)` calls `start()` immediately and returns `setInterval(start, intervalMs)`.

- [ ] **Step 5: Run sync and store tests**

Run: `bun test src/test/reseed-sync.test.ts src/test/reseed-store.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit synchronization**

```bash
git add src/reseed-sync.ts src/test/reseed-sync.test.ts
git commit -m "feat(reseed): sync all request pages"
```

---

### Task 5: Build the Safe Searchable Dashboard

**Files:**

- Create: `src/reseed-dashboard.ts`
- Create: `src/reseed-ui.js`
- Create: `src/test/reseed-dashboard.test.ts`
- Create: `src/test/reseed-ui.test.ts`
- Modify: `src/dashboard.ts`
- Modify: `src/test/dashboard.test.ts`

**Interfaces:**

- Produces: `renderReseedDashboard(): string`.
- Produces from `reseed-ui.js`: `filterRequests(requests, filters)` and `sortRequests(requests, sort)` for Bun tests and browser use.
- Browser consumes `GET /reseed-data`, `POST /reseed-refresh`, and links to `/reseed-download?id=<numeric-id>`.

- [ ] **Step 1: Write failing pure UI tests**

```ts
import { describe, expect, it } from "bun:test";
import { filterRequests, sortRequests } from "../reseed-ui.js";

const rows = [
  { torrentId: "1", title: "Ubuntu", category: "Software", requester: "Alice", seedBonus: 100, sizeBytes: 1000, requestedAt: "2026-09-01" },
  { torrentId: "2", title: "Movie", category: "Movies", requester: "Bob", seedBonus: 500, sizeBytes: 5000, requestedAt: "2026-09-07" },
];

it("combines text, category, and range filters with AND semantics", () => {
  expect(filterRequests(rows, {
    query: "movie", category: "Movies", requester: "",
    minBonus: 400, maxBonus: null, minSize: null, maxSize: 6000,
    fromDate: "2026-09-01", toDate: "2026-09-08",
  }).map((row) => row.torrentId)).toEqual(["2"]);
});

it("sorts without mutating input", () => {
  expect(sortRequests(rows, { key: "seedBonus", direction: "desc" })[0].torrentId).toBe("2");
  expect(rows[0].torrentId).toBe("1");
});
```

Add cases for torrent-ID/requester search, null numeric fields, clearing filters, ascending strings, and descending dates.

- [ ] **Step 2: Write failing dashboard-shell tests**

Assert `renderReseedDashboard()` contains accessible labels for search, category, bonus, size, requester, date range, clear filters, refresh, summary cards, table, `/reseed-ui.js`, and a link back to `/`. Extend the existing dashboard test to require `href="/reseed"`.

- [ ] **Step 3: Run UI tests and verify they fail**

Run: `bun test src/test/reseed-ui.test.ts src/test/reseed-dashboard.test.ts src/test/dashboard.test.ts`

Expected: FAIL because the new UI modules and main-dashboard link do not exist.

- [ ] **Step 4: Implement pure filtering and sorting in `src/reseed-ui.js`**

Export functions using plain JavaScript. Normalize search with `String(value ?? "").toLocaleLowerCase()`. Search title, torrent ID, and requester. Apply all populated filters with AND semantics. Return copied arrays from sorting. Compare nulls last in either direction.

Guard DOM startup:

```js
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}
```

Inside `init`, fetch `/reseed-data`, populate category/requester options, bind controls, and rerender. Derive extra columns from the union of every `row.details` key so all upstream-visible metadata remains visible. Build every header and cell with `document.createElement` and `textContent`. Parse numeric filter inputs only when finite and non-negative. Create action anchors only after `/^\d+$/.test(row.torrentId)`; set URLs with `URLSearchParams` rather than string interpolation.

The manual refresh button posts to `/reseed-refresh`, disables while a sync is running, and polls `/reseed-data` until state is no longer `running`. Also reload data every 30 seconds.

- [ ] **Step 5: Implement the page shell and main navigation**

`renderReseedDashboard()` returns the existing dark visual style, responsive request-count/total-bonus/last-sync/sync-state cards, labeled filter controls, a horizontally scrollable table, empty/error states, and:

```html
<script type="module" src="/reseed-ui.js"></script>
```

Add `<a href="/reseed">Reseed Requests</a>` to the existing dashboard header without restructuring its status code.

- [ ] **Step 6: Run UI tests**

Run: `bun test src/test/reseed-ui.test.ts src/test/reseed-dashboard.test.ts src/test/dashboard.test.ts`

Expected: all tests PASS.

- [ ] **Step 7: Commit the dashboard**

```bash
git add src/reseed-dashboard.ts src/reseed-ui.js src/dashboard.ts src/test/reseed-dashboard.test.ts src/test/reseed-ui.test.ts src/test/dashboard.test.ts
git commit -m "feat(reseed): add searchable dashboard"
```

---

### Task 6: Wire Routes, Downloading, and Startup

**Files:**

- Modify: `src/index.ts`
- Create: `src/test/reseed-routes.test.ts`

**Interfaces:**

- Consumes all interfaces from Tasks 2–5.
- Produces open LAN routes: `GET /reseed`, `GET /reseed-ui.js`, `GET /reseed-data`, `POST /reseed-refresh`, and `GET /reseed-download?id=<id>`.
- Produces: `torrentDownloadResponse(id: string, downloader?: typeof downloadTorrent): Promise<Response>` in `src/index.ts`, shared by both download routes and directly testable with an injected downloader.

- [ ] **Step 1: Write failing route tests**

Set `TBD_USERNAME`, `TBD_PASSWORD`, `TBD_TOTP_SECRET`, and `PROXY_API_KEY` to inert test values, set `NODE_ENV=test`, then dynamically import `app` so configuration is evaluated after setup. Assert:

```ts
expect((await app.request("/reseed")).status).toBe(200);
expect((await app.request("/reseed-ui.js")).headers.get("content-type")).toContain("javascript");

const dataResponse = await app.request("/reseed-data");
expect(dataResponse.status).toBe(200);
expect(await dataResponse.json()).toEqual(expect.objectContaining({
  requests: expect.any(Array),
  count: expect.any(Number),
  totalSeedBonus: expect.any(Number),
  sync: expect.objectContaining({ state: expect.any(String) }),
}));

expect((await app.request("/reseed-download?id=abc")).status).toBe(400);
```

Verify `/reseed-data` output does not contain the configured proxy API key or cookie-like fields. Directly test `torrentDownloadResponse("42", fakeDownloader)` with an injected successful `Response` and a throwing downloader; no test may make a real network call.

- [ ] **Step 2: Run route tests and verify they fail**

Run: `NODE_ENV=test bun test src/test/reseed-routes.test.ts`

Expected: FAIL with 404 responses.

- [ ] **Step 3: Initialize reseed dependencies in `src/index.ts`**

Create one store from `config.reseedDbPath` and one synchronizer using `fetchReseedPage`, `parseReseedPage`, `config.tbdBaseUrl`, and `runtimeStatus.record`.

Register routes before the request logger or retain the current Hono registration order consistently:

- `/reseed` returns `renderReseedDashboard()`.
- `/reseed-ui.js` returns `Bun.file(new URL("./reseed-ui.js", import.meta.url))` with `text/javascript; charset=utf-8`.
- `/reseed-data` returns records plus count, numeric bonus sum, and store metadata.
- `/reseed-refresh` calls `synchronizer.start()` and returns `{ started, sync: store.metadata() }` with status `202` when started and `200` when already running.
- `/reseed-download` validates `/^\d+$/`, calls the existing `downloadTorrent`, and streams the same headers as `/download` without exposing an API key.

Implement exported `torrentDownloadResponse(id, downloader = downloadTorrent)` and reuse it from both `/download` and `/reseed-download`; do not duplicate the streaming headers/error mapping.

- [ ] **Step 4: Start polling only outside tests**

Extend the existing production guard:

```ts
if (process.env.NODE_ENV !== "test") {
  reseedSynchronizer.startPolling(300_000);
}
```

If the execution branch already contains a shared startup guard for health checks, place both startup calls in that guard.

- [ ] **Step 5: Run route and regression tests**

Run: `NODE_ENV=test bun test src/test/reseed-routes.test.ts && NODE_ENV=test bun test`

Expected: route tests and the complete suite PASS without upstream network access.

- [ ] **Step 6: Commit route integration**

```bash
git add src/index.ts src/test/reseed-routes.test.ts
git commit -m "feat(reseed): expose dashboard routes"
```

---

### Task 7: Verify Live Markup and Document Operations

**Files:**

- Modify if selectors require it: `src/reseed-parser.ts`
- Modify if selectors require it: `src/test/reseed-parser.test.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**

- No new runtime interface.
- Confirms the generic parser against authenticated production markup before deployment.

- [ ] **Step 1: Run one authenticated page fetch without logging secrets or raw HTML**

Rebuild and start the service with the normal environment, trigger `POST /reseed-refresh`, wait up to three minutes for login/scraping, then inspect only `/reseed-data` and service logs:

```bash
docker compose up -d --build
curl -fsS -X POST http://localhost:6950/reseed-refresh
for attempt in $(seq 1 60); do
  state=$(curl -fsS http://localhost:6950/reseed-data | bun -e 'const d=await Bun.stdin.json(); console.log(d.sync.state)')
  [ "$state" != "running" ] && break
  sleep 3
done
curl -fsS http://localhost:6950/reseed-data | bun -e '
const data = await Bun.stdin.json();
console.log({ count: data.count, sync: data.sync, fields: Object.keys(data.requests[0] ?? {}) });
'
```

Expected: sync reaches `idle`, count is non-negative, and no credentials/cookies appear. If the live table uses different header aliases or pagination markup, add the exact sanitized structure as a parser fixture and minimally extend the parser rules; never save usernames, cookies, passkeys, or full private HTML.

- [ ] **Step 2: Verify a valid row's actions manually**

Open `/reseed`, apply two filters together, change sort direction, use **Open on TorrentBD**, and download one valid row through `/reseed-download`. Confirm the original link stays on the configured TorrentBD origin and the download response is a torrent attachment.

- [ ] **Step 3: Document configuration and routes**

Add to `.env.example`:

```dotenv
# Optional; defaults to /data/cloak-profile/reseed.sqlite in Docker
# RESEED_DB_PATH=/data/cloak-profile/reseed.sqlite
```

Add README endpoint rows for `/reseed`, `/reseed-data`, `/reseed-refresh`, and `/reseed-download?id=<id>`. Document startup plus five-minute refresh, last-good snapshot behavior, immediate deletion after a successful sync, and SQLite persistence in the existing Docker volume.

- [ ] **Step 4: Run final automated verification**

Run:

```bash
bunx tsc --noEmit
NODE_ENV=test bun test
git diff --check
```

Expected: TypeScript exits 0, all tests pass, and `git diff --check` prints nothing.

- [ ] **Step 5: Run diagnostics on every changed source file**

Run `lsp_diagnostics` on `src/` with severity `error`, then `lens_diagnostics` with mode `all`. Expected: no blocking errors in edited files.

- [ ] **Step 6: Commit documentation and any live-selector correction**

```bash
git add .env.example README.md src/reseed-parser.ts src/test/reseed-parser.test.ts
git commit -m "docs(reseed): document sync operations"
```

Skip unchanged parser paths in `git add` if live markup required no correction.
