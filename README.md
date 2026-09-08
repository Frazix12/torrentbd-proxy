# TorrentBD Torznab Proxy

A Dockerized Torznab proxy for TorrentBD using Bun and CloakBrowser. It handles TorrentBD login, TOTP authentication, search, torrent downloads, and persistent browser sessions.

> **⚠️ Disclaimer**: This project is strictly for **educational and personal research purposes only**. The authors and contributors are **not accountable or liable** for any account bans, suspensions, warnings, IP blocks, or punitive actions taken by TorrentBD or any third parties. Use entirely at your own risk.

## Setup

1. Create the environment file:

   ```bash
   cp .env.example .env
   ```

2. Set the required values in `.env`:

   - `TBD_USERNAME`
   - `TBD_PASSWORD`
   - `TBD_TOTP_SECRET`
   - `PROXY_API_KEY`

3. Start the service:

   ```bash
   docker compose up -d --build
   ```

The service listens on port **6950**.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `http://<host>:6950/` | Read-only status dashboard |
| `http://<host>:6950/status` | Runtime status JSON |
| `http://<host>:6950/health` | Container health check |
| `http://<host>:6950/reseed` | Reseed requests dashboard |
| `http://<host>:6950/reseed-data` | Reseed snapshot data JSON |
| `http://<host>:6950/reseed-refresh` | Trigger on-demand reseed synchronization |
| `http://<host>:6950/reseed-download?id=<id>` | Proxied torrent download for reseed requests |
| `http://<host>:6950/api?t=caps&apikey=<key>` | Torznab capabilities |
| `http://<host>:6950/api?t=search&q=<query>&apikey=<key>` | Torrent search |
| `http://<host>:6950/download?id=<id>&apikey=<key>` | Torrent download |

## Prowlarr

Add a **Generic Torznab** indexer with:

- URL: `http://<host>:6950`
- API key: the `PROXY_API_KEY` value from `.env`

## Persistence

The `cloak-profile` Docker volume stores browser cookies and session state as well as the SQLite database for reseed requests (`/data/cloak-profile/reseed.sqlite`). Normal container recreation preserves both the authenticated session and cached reseed data:

```bash
docker compose down
docker compose up -d
```

Do not run `docker compose down -v` unless you intend to erase the browser profile and force a new login.

## Reseed Requests

The proxy features an authenticated background synchronizer and a dedicated LAN dashboard for TorrentBD reseed requests:

- **Synchronization**: Automatically syncs upon proxy startup and repeats every 5 minutes (`300,000 ms`). Manual on-demand sync can be triggered from the dashboard or via `POST /reseed-refresh`. Concurrency guards prevent overlapping sync operations.
- **Multi-Page Scraping & Atomic Deletion**: Traverses all pagination pages to collect active requests. If all pages parse successfully, the snapshot is updated in a single atomic SQLite transaction. Requests that have disappeared upstream are immediately deleted.
- **Last-Good Snapshot**: If synchronization fails mid-process (e.g. network interruption, Cloudflare challenge, or upstream error), the previous snapshot is retained untouched. The failure status and error details are tracked and shown on the dashboard.
- **Local SQLite Persistence**: Reseed requests and sync metadata are persisted locally using Bun's native SQLite (`bun:sqlite`). By default, the database is stored at `/data/cloak-profile/reseed.sqlite` within the persistent `cloak-profile` Docker volume, configurable via `RESEED_DB_PATH`.
- **LAN Dashboard & Secure Download**: The `/reseed` page provides responsive, client-side search and filtering (by category, bonus, size, requester, date range, and text search) with sortable columns. Torrent downloads use `/reseed-download?id=<id>`, allowing downloads on the local network without exposing the proxy API key.

## Operations

```bash
# Follow logs
docker compose logs -f

# Check service state
docker compose ps

# Restart
docker compose restart

# Stop
docker compose down
```

If a fresh profile remains on a Cloudflare challenge, set a current `CLOAKBROWSER_LICENSE_KEY` in `.env` and rebuild. The bundled unlicensed browser is an older release.

## Development Checks

```bash
bun test
bunx tsc --noEmit
docker compose config --quiet
```

## License & Fair Use

This software is released under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](LICENSE) license.

- **Free for Personal & Educational Use**: You are free to run, modify, and learn from this project.
- **No Commercial Use**: Any commercial use, monetization, or paid distribution is strictly prohibited.
- **ShareAlike / Open Source for Forks**: Any forks, derivatives, or redistributions must remain open source under the exact same license terms.
