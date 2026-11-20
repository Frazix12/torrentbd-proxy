# TorrentBD Torznab Proxy

> A Dockerized [Torznab](https://torznab.github.io/spec-1.3-draft/) proxy for **TorrentBD** — handles login, TOTP 2FA, Cloudflare bypass, search, downloads, persistent sessions, reseed tracking, and webhook alerts.

> ⚠️ **Disclaimer:** For personal and educational use only. The authors are not liable for account bans, IP blocks, or any action taken by TorrentBD or third parties. Use at your own risk.

---

## Quick Start

**1. Configure**

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

| Variable | Description |
|---|---|
| `TBD_USERNAME` | TorrentBD account email |
| `TBD_PASSWORD` | TorrentBD password |
| `TBD_TOTP_SECRET` | Base32 TOTP secret (from 2FA setup) |
| `PROXY_API_KEY` | Any secret string — used to authenticate Prowlarr |

Optional tuning (defaults shown):

| Variable | Default | Description |
|---|---|---|
| `CACHE_TTL_SECONDS` | `300` | How long search results are cached |
| `HEALTH_CHECK_INTERVAL_MINUTES` | `30` | How often feature health checks run |
| `RESEED_SYNC_INTERVAL_HOURS` | `6` | How often reseed requests are synced |
| `NOTIFY_WEBHOOK_URL` | _(empty)_ | Webhook for failure alerts — supports ntfy.sh, Discord, Slack |
| `PORT` | `6950` | Listening port |
| `CLOAK_PROFILE_DIR` | `/data/cloak-profile` | Persistent browser profile path |
| `CACHE_DB_PATH` | `<profile>/cache.sqlite` | Override cache database path |
| `RESEED_DB_PATH` | `<profile>/reseed.sqlite` | Override reseed database path |

**2. Build & run**

```bash
docker compose up -d --build
```

The proxy starts on **port 6950**. On first run it logs in and saves the session — subsequent restarts reuse stored cookies and skip login entirely. The search result cache also persists across restarts.

Open **http://&lt;your-host&gt;:6950** for the new dashboard UI (Sonarr/Radarr-style dark theme): status/health overview, torrent search, reseed requests, activity log, and settings.

---

## Dashboard UI & security

The dashboard is a dependency-free SPA served directly by the proxy at `/` (assets under `/ui/`). It has five sidebar pages:

| Page | What it shows |
|---|---|
| **Dashboard** | Session state, uptime, cache hit rate, request metrics, feature-health table, recent activity (auto-refreshes every 30s) |
| **Search** | Search TorrentBD by keyword and category, with live results and direct download links |
| **Reseed Requests** | Active/history tabs, sync stats and a manual refresh button |
| **Activity** | Full event log with level filtering |
| **Settings** | Connection details, dashboard-key management and a "Test connection" action |

Set `DASHBOARD_API_KEY` in `.env` and rebuild to require a login key for every dashboard and admin route — the UI shows a login screen on first load, stores the key in your browser's `localStorage` and sends it as `X-Dashboard-Key`. A compact **Log out** button appears in the sidebar footer only when authentication is enabled; clicking it clears the stored key. Leave `DASHBOARD_API_KEY` blank for the current open-LAN behaviour (no login screen, no logout button).

Additional hardening options:

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_API_KEY` | _(empty)_ | Guards `/`, `/status`, `/reseed*`, `/test`, `/metrics` and `/api/ui/*` |
| `PUBLIC_BASE_URL` | _(empty)_ | Canonical URL used in Torznab enclosure links; prevents Host-header spoofing |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-For` for rate limiting (only behind a trusted proxy) |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |
| `RATE_LIMIT_MAX` | `30` | Search requests allowed per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds |

The Torznab API key may now be sent as an `X-Api-Key` header instead of `?apikey=`; query parameters still work for older clients. API keys are redacted from logs.

---

## Add to Prowlarr

1. Go to **Prowlarr → Indexers → Add Indexer**
2. Search for **Torznab** → select **Generic Torznab**
3. Set:
   - **URL:** `http://<your-host>:6950`
   - **API Key:** the `PROXY_API_KEY` value from `.env`
4. Click **Test** then **Save**

> Replace `<your-host>` with your machine's LAN IP (e.g. `192.168.0.55`) or `localhost` if Prowlarr runs on the same machine.

---

## Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /` | dashboard key¹ | New Sonarr/Radarr-style dashboard SPA |
| `GET /ui/styles.css`, `/ui/app.js` | dashboard key¹ | UI static assets |
| `GET /status` | dashboard key¹ | Runtime status JSON |
| `GET /metrics` | dashboard key¹ | Request/cache/session counters |
| `GET /health` | none | Docker health check |
| `POST /test` | dashboard key¹ | Run feature health checks on demand |
| `GET /reseed` | dashboard key¹ | Legacy reseed requests dashboard |
| `GET /reseed-data` | dashboard key¹ | Active reseed snapshot JSON |
| `GET /reseed-history` | dashboard key¹ | Recently fulfilled/removed requests (last 30 days) |
| `POST /reseed-refresh` | dashboard key¹ | Trigger manual reseed sync |
| `GET /reseed-download?id=<id>` | dashboard key¹ | Download torrent by ID |
| `GET /api/ui/*` | dashboard key¹ | JSON API used by the SPA (config, status, metrics, search, reseed, test, download) |
| `GET /api?t=caps&apikey=<key>` | apikey² | Torznab capabilities |
| `GET /api?t=search&q=<query>&apikey=<key>` | apikey² | Search torrents (rate limited: 30 req/60s) |
| `GET /download?id=<id>&apikey=<key>` | apikey² | Download torrent |

¹ Only when `DASHBOARD_API_KEY` is set; otherwise open on the LAN.
² `X-Api-Key: <key>` header is preferred; `?apikey=` still works.

---

## Persistence

The `cloak-profile` Docker volume stores the browser profile, session cookies, the search cache, and the reseed SQLite database. Everything survives container restarts automatically.

```bash
# Safe — preserves session, cache, and data
docker compose down && docker compose up -d

# Destructive — wipes profile and forces re-login
docker compose down -v
```

---

## Reseed Requests

The `/reseed` dashboard syncs TorrentBD reseed requests in the background:

- Syncs **30 seconds after startup**, then every **6 hours** (configurable via `RESEED_SYNC_INTERVAL_HOURS`)
- Also polls every 5 minutes to catch manual triggers
- Scrapes all pages atomically — previous snapshot kept on failure
- Removed requests are **soft-deleted** and visible in the "Recently Fulfilled" section for 30 days
- Client-side filtering by category, size, bonus, requester, and date
- Download via `/reseed-download?id=<id>` — no API key exposed on LAN

---

## Notifications

Set `NOTIFY_WEBHOOK_URL` in `.env` to receive alerts when things go wrong:

| Event | Alert sent |
|---|---|
| Feature health check fails (session, search, browse, download) | ✅ |
| Reseed sync fails | ✅ |
| Session cookie expires and re-login is triggered | ✅ |

**Supported webhook formats:**

| Service | URL pattern | Format |
|---|---|---|
| **ntfy.sh** | `https://ntfy.sh/<topic>` | Plain text POST |
| **Discord** | `https://discord.com/api/webhooks/…` | JSON `{ "content": "…" }` |
| **Slack** | `https://hooks.slack.com/…` | JSON `{ "content": "…" }` |

---

## Operations

```bash
docker compose logs -f        # tail logs
docker compose ps             # check status
docker compose restart        # restart (keeps session and cache)
docker compose down           # stop (keeps volume)
```

> **Cloudflare / Turnstile challenges:** the default setup uses the bundled CloakBrowser 0.5.x browser, which works without a license key but ships an older Chromium build. The login flow now detects and clicks the Turnstile checkbox, verifies success via the `cf-turnstile-response` token, and reloads a stuck challenge automatically. If challenges still block login, grab a **free** key from <https://cloakbrowser.dev/free>, add `CLOAKBROWSER_LICENSE_KEY=...` to `.env`, and rebuild (`docker compose up -d --build`). With a key, CloakBrowser downloads the newest Chromium build that auto-solves Turnstile non-interactively and needs no manual clicking. Without a key, stay on the 0.5.x image/tag — newer CloakBrowser releases require a license even on the free tier and will fail to start in Docker without one.

---

## Development

```bash
bun test
bunx tsc --noEmit
```

---

## License

[CC BY-NC-SA 4.0](LICENSE) — free for personal and educational use, no commercial use, forks must stay open source under the same terms.
