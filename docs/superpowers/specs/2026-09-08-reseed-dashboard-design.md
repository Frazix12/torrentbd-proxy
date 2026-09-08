# Reseed Requests Dashboard Design

## Goal

Collect every active request from TorrentBD's authenticated `reseed-requests.php` pages and expose the current list on a separate, searchable dashboard page. Each request must show its seed bonus, all useful metadata visible in the upstream list, a proxied torrent download action, and a link to the original TorrentBD page.

The page remains read-only and has the same open LAN access as the existing status dashboard.

## Scope

### Included

- Authenticated five-minute synchronization of all reseed-request pagination pages
- Immediate synchronization at application startup
- Persistent current-state storage using Bun's built-in SQLite support
- A separate `/reseed` dashboard page
- A JSON endpoint used by that page
- A manual refresh action
- Search, filters, and sortable columns
- Links from the main dashboard to the reseed page
- Download through the existing proxy and direct links to TorrentBD details
- Sync state and failures in the dashboard and existing runtime event log
- Focused parser, synchronization, storage, and dashboard tests

### Excluded

- Claiming, fulfilling, editing, or creating reseed requests
- Request history or retention after a request disappears upstream
- Separate dashboard authentication
- Server-side pagination and filter query APIs unless the real dataset proves too large for browser filtering

## Architecture

The feature has four small units:

1. **TorrentBD client:** fetches an authenticated reseed-list page through the existing session and retry behavior.
2. **Parser:** converts one upstream HTML page into normalized request records and discovers the next page.
3. **Snapshot store and synchronizer:** fetches all pages, validates the complete result, and atomically replaces the SQLite snapshot.
4. **Dashboard:** serves static HTML at `/reseed` and current snapshot JSON from `/reseed-data`.

The synchronizer starts once when the service starts and repeats every five minutes. Only one synchronization may run at a time. A manual refresh uses the same synchronizer; if a sync is already running, it returns the existing in-progress state instead of starting another.

The browser receives the full current snapshot and performs search, filtering, and sorting locally. This avoids unnecessary query endpoints and is appropriate for a dashboard-sized active list.

## Upstream Data Discovery

Implementation must first capture representative authenticated HTML from `https://www.torrentbd.net/reseed-requests.php`, including at least one additional pagination page when available. Selectors and pagination rules must be based on that markup rather than guessed.

Every meaningful field visible in each upstream list row must appear in the normalized response and dashboard. Expected fields include, where supplied upstream:

- Torrent ID
- Title
- Category
- Seed bonus
- Requester
- Request date or age
- Torrent size
- Seeders and leechers
- Additional row-visible request metadata
- TorrentBD details URL
- Proxied download URL
- Last-seen timestamp

Missing optional values are represented as `null` and displayed as `—`. Torrent IDs, URLs, numeric values, and pagination targets are validated before storage.

## Storage

Use `bun:sqlite`; no new dependency is needed. The database defaults to `/data/cloak-profile/reseed.sqlite`, which is already inside the persistent Docker volume, and is configurable for local development and tests.

The database contains one current-snapshot table keyed by TorrentBD torrent ID and a small metadata table for synchronization status:

- Last attempted sync time
- Last successful sync time
- Last error
- Current sync state

A successful complete scrape replaces the previous rows in one transaction. Therefore, requests missing from TorrentBD are deleted immediately, as requested. Duplicate torrent IDs encountered across pages are merged before replacement.

A failed or incomplete scrape never modifies the prior snapshot. Zero results are accepted only when the upstream page is positively recognized as a valid empty reseed list; an unrecognized or malformed page is a parse failure.

## Synchronization Flow

1. Mark synchronization as running.
2. Fetch page one using existing authenticated session headers.
3. Detect login redirects and Cloudflare challenges through the existing retry path.
4. Parse rows and the next-page target.
5. Continue until no next page exists, rejecting loops or malformed pagination.
6. Deduplicate records by torrent ID.
7. Validate that every parsed record has its required identity and links.
8. Replace the SQLite snapshot in one transaction.
9. Record success and notify the runtime event log.

Any network, authentication, pagination, parsing, or database error records a failed attempt while preserving the last successful snapshot.

## HTTP Routes

### `GET /reseed`

Returns the reseed dashboard HTML. Access matches the existing open LAN dashboard.

### `GET /reseed-data`

Returns:

- Current request records
- Request count
- Total numeric seed bonus when values can be normalized
- Last attempted and successful sync times
- Sync state and last error

Scraped text is returned as JSON data and inserted into the page using safe DOM text operations, not unescaped HTML interpolation.

### `POST /reseed-refresh`

Starts an immediate synchronization. The endpoint reports whether a new sync started or one was already running. It does not wait for the entire upstream scrape before responding.

## Dashboard UX

The main dashboard gains a **Reseed Requests** navigation link. The separate page includes:

- Current request count
- Total offered seed bonus
- Last successful sync time
- Current refresh state and latest error
- Manual refresh button
- Instant text search across title, torrent ID, and requester
- Category filter
- Seed-bonus minimum and maximum filters
- Torrent-size minimum and maximum filters
- Requester filter
- Request date or age filter
- Sortable data columns
- Clear-all-filters control
- Per-row **Download torrent** action through `/download`
- Per-row **Open on TorrentBD** link

Filtering and sorting combine predictably: all active filters use AND semantics, text search matches any searchable field, and changing filters does not trigger upstream traffic. The page periodically reloads `/reseed-data` so a completed background sync appears without a full-page reload.

The table supports horizontal scrolling on narrow screens rather than hiding request information.

## Security and Validation

- The feature remains intended for a trusted LAN, matching the existing dashboard.
- Authentication cookies and credentials never enter dashboard responses or logs.
- Upstream text is rendered with text-safe DOM APIs.
- Only validated numeric torrent IDs can produce download or original-detail links.
- Pagination links must remain on the configured TorrentBD origin.
- Manual refresh is concurrency guarded to prevent request amplification.
- Errors are explicit and preserve the last known-good data.

## Testing

Focused Bun tests will cover:

1. Parsing a representative reseed row, including bonus and all upstream-visible fields.
2. Empty-list recognition versus malformed/login HTML.
3. Pagination discovery and termination.
4. Multi-page aggregation and duplicate torrent IDs.
5. Atomic replacement deleting disappeared requests.
6. Failed synchronization preserving the previous snapshot.
7. Concurrent/manual refresh guarding.
8. Reseed routes and key dashboard controls.
9. Search, combined filters, sorting, and safe rendering using the smallest practical browser-free test surface.

Existing Torznab, download, login, dashboard, and health behavior must continue to pass its current tests.

## Acceptance Criteria

- Every active request across all upstream pages appears after a successful sync.
- Synchronization occurs at startup and every five minutes.
- Removed upstream requests disappear after the next successful sync.
- Failed syncs retain the last successful data and visibly report the failure.
- Users can search and combine all agreed filters, then sort the result.
- Every valid row exposes seed bonus, all useful upstream list metadata, proxied download, and original-page links.
- Data and browser profile survive normal Docker container recreation.
- No new runtime dependency is introduced.
