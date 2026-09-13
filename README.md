# TorrentBD Torznab Proxy

> A Dockerized [Torznab](https://torznab.github.io/spec-1.3-draft/) proxy for **TorrentBD** — handles login, TOTP 2FA, Cloudflare bypass, search, downloads, and persistent sessions.

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

**2. Build & run**

```bash
docker compose up -d --build
```

The proxy starts on **port 6950**. On first run it logs in and saves the session — subsequent restarts reuse stored cookies and skip login entirely.

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

| Endpoint | Description |
|---|---|
| `GET /` | Status dashboard |
| `GET /status` | Runtime status JSON |
| `GET /health` | Docker health check |
| `GET /reseed` | Reseed requests dashboard |
| `GET /reseed-data` | Reseed snapshot JSON |
| `POST /reseed-refresh` | Trigger manual reseed sync |
| `GET /reseed-download?id=<id>` | Proxied torrent download (no API key needed) |
| `GET /api?t=caps&apikey=<key>` | Torznab capabilities |
| `GET /api?t=search&q=<query>&apikey=<key>` | Search torrents |
| `GET /download?id=<id>&apikey=<key>` | Download torrent |

---

## Persistence

The `cloak-profile` Docker volume stores browser cookies, session state, and the reseed SQLite database. Sessions survive container restarts automatically.

```bash
# Safe — preserves session and data
docker compose down && docker compose up -d

# Destructive — wipes profile and forces re-login
docker compose down -v
```

---

## Reseed Requests

The `/reseed` dashboard syncs TorrentBD reseed requests in the background:

- Syncs on startup, then every **5 minutes**
- Scrapes all pages atomically — previous snapshot kept on failure
- Client-side filtering by category, size, bonus, requester, and date
- Download via `/reseed-download?id=<id>` — no API key exposed on LAN

---

## Operations

```bash
docker compose logs -f        # tail logs
docker compose ps             # check status
docker compose restart        # restart
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
