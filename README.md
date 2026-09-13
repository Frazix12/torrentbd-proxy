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
| `GET /` | none | Status dashboard |
| `GET /status` | none | Runtime status JSON |
| `GET /health` | none | Docker health check |
| `POST /test` | none | Run feature health checks on demand |
| `GET /reseed` | none | Reseed requests dashboard |
| `GET /reseed-data` | none | Active reseed snapshot JSON |
| `GET /reseed-history` | none | Recently fulfilled/removed requests (last 30 days) |
| `POST /reseed-refresh` | none | Trigger manual reseed sync |
| `GET /reseed-download?id=<id>` | none | Download torrent by ID (no API key on LAN) |
| `GET /api?t=caps&apikey=<key>` | apikey | Torznab capabilities |
| `GET /api?t=search&q=<query>&apikey=<key>` | apikey | Search torrents (rate limited: 30 req/60s) |
| `GET /download?id=<id>&apikey=<key>` | apikey | Download torrent |

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

> If the browser gets stuck on a Cloudflare challenge, set a `CLOAKBROWSER_LICENSE_KEY` in `.env` and rebuild — the bundled unlicensed binary is an older release.

---

## Development

```bash
bun test
bunx tsc --noEmit
```

---

## License

[CC BY-NC-SA 4.0](LICENSE) — free for personal and educational use, no commercial use, forks must stay open source under the same terms.
