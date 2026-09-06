# TorrentBD Torznab Proxy — Design Spec

## Overview

A Torznab-compatible proxy that sits between Prowlarr and TorrentBD. Prowlarr
adds it as a Generic Torznab indexer. The proxy handles all Cloudflare bypass
(via FlareSolverr), auto-login with TOTP 2FA, HTML scraping, and Torznab XML
generation. Prowlarr never touches TorrentBD directly.

```
Prowlarr → Generic Torznab Indexer → Our Proxy → FlareSolverr → TorrentBD
```

**Why a proxy instead of using Prowlarr's built-in TorrentBD definition:**
Prowlarr's definition uses the cookie method (manual paste). `cf_clearance`
is cryptographically bound to the User-Agent that solved the CF challenge —
any UA mismatch causes immediate redirect to login. The proxy owns the session
end-to-end and ensures UA consistency across all requests.

---

## Tech Stack

- **Runtime:** Bun
- **Framework:** Hono
- **HTML parsing:** cheerio
- **TOTP:** `@levminer/otp` or `otpauth` (tiny, no deps)
- **Containerisation:** Docker + docker-compose

---

## Configuration

All config via environment variables. No config file needed.

```env
TBD_USERNAME=           # TorrentBD login username
TBD_PASSWORD=           # TorrentBD login password
TBD_TOTP_SECRET=        # Base32 TOTP secret from authenticator app
TBD_BASE_URL=https://www.torrentbd.net
FLARESOLVERR_URL=http://flaresolverr:8191
PROXY_API_KEY=changeme  # Prowlarr uses this as the indexer API key
CACHE_TTL_SECONDS=300   # Search result cache TTL (default 5 min)
PORT=5000
```

---

## Folder Structure

```
torrentbd-proxy/
├── src/
│   ├── index.ts          # Hono app, route wiring, entry point
│   ├── config.ts         # Env var loading + validation
│   ├── session.ts        # Cookie store, auto-login, expiry detection
│   ├── flaresolverr.ts   # FlareSolverr HTTP client
│   ├── tbd-client.ts     # TorrentBD HTTP calls (search, browse, download)
│   ├── parser.ts         # Cheerio HTML scraper
│   ├── categories.ts     # Torznab category IDs ↔ TBD group names
│   ├── torznab.ts        # Torznab XML builder + caps XML
│   └── cache.ts          # In-memory search result cache (Map + TTL)
├── src/test/
│   ├── parser.test.ts
│   ├── categories.test.ts
│   ├── torznab.test.ts
│   └── cache.test.ts
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Endpoints

### `GET /api?t=caps&apikey=<key>`

Returns Torznab capabilities XML. Prowlarr hits this during indexer setup.
Declares supported search modes and all category mappings.

### `GET /api?t=search&q=<query>&cat=<cats>&apikey=<key>`

### `GET /api?t=tvsearch&q=<query>&cat=<cats>&apikey=<key>`

### `GET /api?t=movie&q=<query>&cat=<cats>&apikey=<key>`

All three map to the same handler. Translates Torznab cat IDs to TBD group
names, calls `POST /ajsearch.php`, parses HTML, returns Torznab XML.

- `cat` is a comma-separated list of Torznab category IDs (e.g. `2000,2010`)
- If no `cat` / cat=0: search all categories (no filter)
- Empty `q`: call `POST /ajgettorrents.php` (latest torrents browse)

### `GET /download?id=<id>&apikey=<key>`

Proxies `GET /download.php?id=<id>` to TorrentBD with session cookies.
Streams the `.torrent` binary back to Prowlarr.

### `GET /health`

Returns `{"status":"ok"}`. Used by Docker health check.

---

## Authentication & Session Flow

### Login sequence

1. Call FlareSolverr `POST /v1` with `cmd=request.get` on TorrentBD homepage
   → receives `cf_clearance` cookie + browser User-Agent string
2. Store the User-Agent — **every subsequent request must use this exact UA**
3. `POST /login.php` (or the site's login endpoint, confirmed via HAR) with
   `username`, `password` and TOTP code (generated from `TBD_TOTP_SECRET`)
   — this goes through FlareSolverr so CF cookies are preserved
4. After login, store full cookie jar: `cf_clearance`, `ufp`, `user`,
   `x_auth`, `tc_uas`, `taf_token`, `ts_argon`
5. All subsequent TBD requests go **direct** (not via FlareSolverr) using
   the stored cookies + stored UA — FlareSolverr is only needed for login

### Session expiry detection

Any TorrentBD response that redirects to `/account-login.php` or
`/cdn-cgi/` triggers an automatic re-login. The failed request is retried
once after re-login succeeds.

### TOTP code generation

At login time, generate a 6-digit TOTP code from `TBD_TOTP_SECRET` using
standard RFC 6238 (30-second window, SHA-1, 6 digits). Use the `otpauth`
npm package — it's 0-dependency and tiny.

---

## TorrentBD API Surface

All confirmed from HAR analysis.

### Search

```
POST https://www.torrentbd.net/ajsearch.php
Content-Type: application/x-www-form-urlencoded

page=1
&kuddus_searchtype=torrents
&kuddus_searchkey=<query>
&searchParams[sortBy]=
&searchParams[secondary_filters_extended]=
&searchParams[torrentcats][]=Movies     ← repeat for each group
&searchParams[torrentcats][]=TV
```

Category group names (case-sensitive): `Movies`, `TV`, `Games`, `Anime`,
`Apps`, `Music`, `Sports`, `Books`, `Documentaries`, `Tutorials`, `Other`

### Browse / Latest (empty search)

```
POST https://www.torrentbd.net/ajgettorrents.php
Content-Type: application/x-www-form-urlencoded

page=1&origin=home&sortBy=&order=&query=&fl=false
&intRelease=false&active=false&spCat=&sf=
&initialList=1&uid=&count=&mto=false
```

### Download

```
GET https://www.torrentbd.net/download.php?id=<id>
Cookie: <session cookies>
User-Agent: <stored UA>
```

Returns binary `.torrent` file.

---

## HTML Parsing

### `ajsearch.php` response structure (confirmed from HAR)

```html
<h6 class="kuddus-results-counter">🔍 14134</h6>
<table class="kuddus-torrents-table">
  <tr>
    <td><img class="cat-pic-img" src="images/categories/v3/i_movies_720p.png"
             title="Movies: Blu-Ray 720p"></td>
    <td>
      <div class="mb-7 block">
        <a href="torrents-details.php?id=1279583&hit=1" class="ttorr-title">
          End of Days 1999 720p BluRay DD5.1 x264-ZoroSenpai
        </a>
        <img class="rel-icon" src="images/free.gif" title="FreeLeech ...">
      </div>
      <div class="blue100 inline-block" title="File Size">
        <i class="material-icons">insert_drive_file</i> 8.83 GiB
      </div>
      <div class="uploaded-by inline-block">
        Uploaded by <a href="account-details.php?id=115197">...</a>,
        <span title="2025-09-24 08:42 PM">11mo 17d ago</span>
      </div>
      <div>
        <div class="thc seed inline" title="Seeders online">
          <i class="material-icons">file_upload</i> 0
        </div>
        <div class="thc leech inline" title="Leechers">
          <i class="material-icons">file_download</i> 0
        </div>
        <div class="thc completed inline" title="Total completed">
          <i class="material-icons">done_all</i> 7
        </div>
      </div>
    </td>
    <td><a href="download.php?id=1279583">...</a></td>
  </tr>
</table>
```

### Fields extracted per torrent

| Field | Selector / source |
|---|---|
| `id` | From `torrents-details.php?id=<ID>` href on `.ttorr-title` |
| `title` | `.ttorr-title` text |
| `category` | `img.cat-pic-img` `title` attribute |
| `size` | `.blue100[title="File Size"]` text (strip icon, parse "8.83 GiB") |
| `seeders` | `.thc.seed` text (strip icon) |
| `leechers` | `.thc.leech` text (strip icon) |
| `grabs` | `.thc.completed` text (strip icon) |
| `publishDate` | `span[title]` inside `.uploaded-by` — use the `title` attribute (ISO-ish datetime) |
| `downloadUrl` | `a[href*="download.php?id="]` href |
| `freeleech` | Presence of `img[src*="free.gif"]` |

### `ajgettorrents.php` response structure (confirmed from HAR)

```html
<table class="torrents-table">
  <tbody>
    <tr>
      <td onclick="mtt.getSpCatTorrents(10)">
        <img class="cat-pic-img" src="..." title="Games: PC">
      </td>
      <td class="torrent-name">
        <span class="dl-sc-trg fx" data-type="torrent" data-tid="1326862">
          <a href="torrents-details.php?id=1326862&hit=1">Title here</a>
        </span>
        <img src="images/free.gif" title="FreeLeech...">
        <span class="torrent-added-on" title="2026-08-08 06:06 PM">29d ago</span>
      </td>
      <td><a href="https://www.torrentbd.net/download.php?id=1326862">...</a></td>
      <td><!-- uploader --></td>
      <td><!-- comments --></td>
      <td><!-- size --></td>
      <td><!-- seeders --></td>
      <td><!-- leechers --></td>
      <td><!-- grabs --></td>
    </tr>
  </tbody>
</table>
```

Fields: same as above but from `table.torrents-table > tbody > tr`.
Size/seeders/leechers/grabs from `td:nth-child(6..9)`.

---

## Category Mapping

Full 50+ category map from Jackett's confirmed definition. TBD numeric IDs
map to Torznab standard IDs:

```typescript
// categories.ts — TBD category img title → { torznabId, groupName }
const CATEGORIES = [
  // Movies
  { tbdTitle: "Movies - Blu-Ray Lossless 4K",   torznabId: 2070, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray Lossless 1080p", torznabId: 2060, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray 4K",             torznabId: 2070, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray 1080p",          torznabId: 2050, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray 720p",           torznabId: 2040, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray SD",             torznabId: 2030, group: "Movies" },
  { tbdTitle: "Movies - WEB-DL 4K",             torznabId: 2070, group: "Movies" },
  { tbdTitle: "Movies - WEB-DL",                torznabId: 2020, group: "Movies" },
  { tbdTitle: "Movies - WEBRip",                torznabId: 2020, group: "Movies" },
  { tbdTitle: "Movies - HD-Rip",                torznabId: 2040, group: "Movies" },
  { tbdTitle: "Movies - DVDRip",                torznabId: 2030, group: "Movies" },
  { tbdTitle: "Movies - CAM | TS | DVDScr | Pre-DVD", torznabId: 2010, group: "Movies" },
  { tbdTitle: "Movies - 3D",                    torznabId: 2050, group: "Movies" },
  { tbdTitle: "Movies - Unrated",               torznabId: 2000, group: "Movies" },
  { tbdTitle: "Movies - Packs",                 torznabId: 2000, group: "Movies" },
  // TV
  { tbdTitle: "TV - Episodes 4K",               torznabId: 5070, group: "TV" },
  { tbdTitle: "TV - Episodes 720p | 1080p",     torznabId: 5040, group: "TV" },
  { tbdTitle: "TV - Episodes SD",               torznabId: 5030, group: "TV" },
  { tbdTitle: "TV - Packs 4K",                  torznabId: 5070, group: "TV" },
  { tbdTitle: "TV - Packs - 720p | 1080p",      torznabId: 5040, group: "TV" },
  { tbdTitle: "TV - Packs SD",                  torznabId: 5030, group: "TV" },
  { tbdTitle: "TV - Awards | Ceremonies",       torznabId: 5000, group: "TV" },
  // Anime
  { tbdTitle: "Anime - All",                    torznabId: 5070, group: "Anime" },
  { tbdTitle: "Cartoons - All",                 torznabId: 5070, group: "TV" },
  // Games
  { tbdTitle: "Games - PC",                     torznabId: 1010, group: "Games" },
  { tbdTitle: "Games - Cracks | Patches",       torznabId: 1010, group: "Games" },
  { tbdTitle: "Games - Updates | DLC",          torznabId: 1010, group: "Games" },
  { tbdTitle: "Games - Backup",                 torznabId: 1010, group: "Games" },
  { tbdTitle: "Games - PlayStation",            torznabId: 1040, group: "Games" },
  { tbdTitle: "Games - Xbox",                   torznabId: 1050, group: "Games" },
  { tbdTitle: "Games - Other",                  torznabId: 1000, group: "Games" },
  // Apps
  { tbdTitle: "Apps - PC",                      torznabId: 4010, group: "Apps" },
  { tbdTitle: "Apps - Mac",                     torznabId: 4020, group: "Apps" },
  { tbdTitle: "Apps - Linux",                   torznabId: 4030, group: "Apps" },
  { tbdTitle: "Apps - Android",                 torznabId: 4040, group: "Apps" },
  // Music
  { tbdTitle: "Music - Audio",                  torznabId: 3000, group: "Music" },
  { tbdTitle: "Music - Lossless",               torznabId: 3040, group: "Music" },
  { tbdTitle: "Music - Video",                  torznabId: 3020, group: "Music" },
  { tbdTitle: "Music - Concerts | Live Shows",  torznabId: 3020, group: "Music" },
  { tbdTitle: "Music - Radio",                  torznabId: 3000, group: "Music" },
  // Books
  { tbdTitle: "Other - E-Books",                torznabId: 7020, group: "Books" },
  { tbdTitle: "E-Books - Comics",               torznabId: 7030, group: "Books" },
  { tbdTitle: "E-Books - Manga",                torznabId: 7030, group: "Books" },
  // Sports
  { tbdTitle: "Sports - Football",              torznabId: 5060, group: "Sports" },
  { tbdTitle: "Sports - Pro Wrestling",         torznabId: 5060, group: "Sports" },
  { tbdTitle: "Sports - All",                   torznabId: 5060, group: "Sports" },
  // Documentaries
  { tbdTitle: "Documentaries - All",            torznabId: 5002, group: "Documentaries" },
  // Other
  { tbdTitle: "Tutorials - All",                torznabId: 7000, group: "Tutorials" },
  { tbdTitle: "Other - Mobile Phone",           torznabId: 4040, group: "Other" },
  { tbdTitle: "Other - Religious",              torznabId: 7000, group: "Other" },
  { tbdTitle: "Other - Miscellaneous",          torznabId: 7000, group: "Other" },
]
```

### Torznab cat ID → TBD group name mapping (for search filtering)

```
2000-2999 → "Movies"
5000-5069 → "TV"
5070      → "Anime" (or "TV" for cartoons)
1000-1999 → "Games"
4000-4999 → "Apps"
3000-3999 → "Music"
7000-7999 → "Books" / "Tutorials" / "Other"
5060      → "Sports"
```

---

## Torznab XML Format

### Caps response (`t=caps`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server title="TorrentBD Proxy"/>
  <limits max="100" default="100"/>
  <searching>
    <search available="yes" supportedParams="q"/>
    <tv-search available="yes" supportedParams="q,season,ep"/>
    <movie-search available="yes" supportedParams="q"/>
    <music-search available="yes" supportedParams="q"/>
    <book-search available="yes" supportedParams="q"/>
  </searching>
  <categories>
    <category id="2000" name="Movies">
      <subcat id="2010" name="Movies/Foreign"/>
      <!-- ... all subcats -->
    </category>
    <!-- ... all top-level cats -->
  </categories>
</caps>
```

### Search response (`t=search`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <title>TorrentBD</title>
    <item>
      <title>End of Days 1999 720p BluRay DD5.1 x264</title>
      <guid>https://www.torrentbd.net/torrents-details.php?id=1279583</guid>
      <link>http://proxy:5000/download?id=1279583&amp;apikey=changeme</link>
      <pubDate>Wed, 24 Sep 2025 20:42:00 +0000</pubDate>
      <torznab:attr name="category" value="2040"/>
      <torznab:attr name="size" value="9481369067"/>
      <torznab:attr name="seeders" value="0"/>
      <torznab:attr name="peers" value="0"/>
      <torznab:attr name="grabs" value="7"/>
      <torznab:attr name="downloadvolumefactor" value="0"/>
      <torznab:attr name="uploadvolumefactor" value="1"/>
    </item>
  </channel>
</rss>
```

Key points:

- `guid`: full detail page URL (unique per torrent)
- `link`: our proxy download URL (not TBD's URL directly)
- `size`: bytes as integer string (parse "8.83 GiB" → bytes)
- `peers`: seeders + leechers
- `downloadvolumefactor`: 0 if freeleech, 1 otherwise
- `pubDate`: RFC 2822 format

---

## Caching

Simple in-memory Map. Key: `${query}|${cats}|${page}`. Value: `{ xml: string, expiresAt: number }`.

Check expiry on every get. No background cleanup needed — TTL is short (5 min).

---

## Docker

### Dockerfile

```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY src ./src
COPY tsconfig.json ./
EXPOSE 5000
CMD ["bun", "src/index.ts"]
```

### docker-compose.yml

```yaml
version: "3.8"
services:
  torrentbd-proxy:
    build: .
    ports:
      - "5000:5000"
    environment:
      - TBD_USERNAME=${TBD_USERNAME}
      - TBD_PASSWORD=${TBD_PASSWORD}
      - TBD_TOTP_SECRET=${TBD_TOTP_SECRET}
      - TBD_BASE_URL=${TBD_BASE_URL:-https://www.torrentbd.net}
      - FLARESOLVERR_URL=${FLARESOLVERR_URL:-http://flaresolverr:8191}
      - PROXY_API_KEY=${PROXY_API_KEY:-changeme}
      - CACHE_TTL_SECONDS=${CACHE_TTL_SECONDS:-300}
      - PORT=5000
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:5000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped
```

---

## Error Handling

- **Login failure** (wrong creds/TOTP): log error, return Torznab error XML, do not retry
- **Login redirect detected**: re-login once, retry request; if second attempt also redirects, return error XML
- **FlareSolverr unreachable**: return Torznab error XML with message
- **Parse failure** (empty/unexpected HTML): return empty results (not error)
- **Download failure**: return 502 with plain text error
- **Missing/invalid apikey**: return 403

---

## Prowlarr Setup (user instructions)

1. Prowlarr → Indexers → Add → Generic Torznab
2. Name: `TorrentBD`
3. URL: `http://<proxy-host>:5000`
4. API Key: value of `PROXY_API_KEY`
5. Test → should return green
