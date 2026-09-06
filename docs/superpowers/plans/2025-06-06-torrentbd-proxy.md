# TorrentBD Torznab Proxy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bun + Hono proxy that exposes a Torznab API to Prowlarr, auto-logging into TorrentBD via FlareSolverr + TOTP and scraping search results as Torznab XML.

**Architecture:** Hono HTTP server receives Torznab requests from Prowlarr, translates them to TorrentBD AJAX calls (via cheerio HTML scraping), and returns Torznab XML. Session cookies are maintained automatically via FlareSolverr login with TOTP 2FA. Downloads are proxied through the session.

**Tech Stack:** Bun, Hono, cheerio, otpauth, Docker

**Spec:** `docs/superpowers/specs/2025-06-06-torrentbd-proxy-design.md`

## Global Constraints

- Bun runtime (not Node) — use `bun` CLI for all commands
- TypeScript throughout — strict mode on
- No new dependencies beyond: `hono`, `cheerio`, `otpauth` — everything else stdlib/Bun built-ins
- All config via env vars — no hardcoded values
- `PROXY_API_KEY` auth on all `/api` and `/download` routes (return 403 if missing/wrong)
- Size field in Torznab XML must be bytes as integer string (not human-readable)
- Download link in XML must point to our proxy (`/download?id=X&apikey=KEY`), not TorrentBD directly
- `pubDate` in RFC 2822 format

---

### Task 1: Project scaffold + config

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `src/config.ts`
- Create: `src/test/config.test.ts`

**Interfaces:**

- Produces: `config` object exported from `src/config.ts`:

  ```typescript
  export const config: {
    tbdUsername: string;
    tbdPassword: string;
    tbdTotpSecret: string;
    tbdBaseUrl: string;   // e.g. "https://www.torrentbd.net"
    flareSolverrUrl: string;
    proxyApiKey: string;
    cacheTtlSeconds: number;
    port: number;
  }
  ```

- [ ] **Step 1: Init package.json**

```bash
cd /mnt/D/CODE/LINUX/CODE/tools-and-automation/torrentBD
bun init -y
```

- [ ] **Step 2: Install dependencies**

```bash
bun add hono cheerio otpauth
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  }
}
```

- [ ] **Step 4: Write .env.example**

```env
TBD_USERNAME=your_username
TBD_PASSWORD=your_password
TBD_TOTP_SECRET=BASE32SECRETHERE
TBD_BASE_URL=https://www.torrentbd.net
FLARESOLVERR_URL=http://flaresolverr:8191
PROXY_API_KEY=changeme
CACHE_TTL_SECONDS=300
PORT=5000
```

- [ ] **Step 5: Write the failing test**

```typescript
// src/test/config.test.ts
import { describe, it, expect, beforeEach } from "bun:test";

describe("config", () => {
  it("throws when required env vars are missing", () => {
    const orig = process.env.TBD_USERNAME;
    delete process.env.TBD_USERNAME;
    expect(() => {
      // re-import by clearing module cache
      delete require.cache[require.resolve("../config")];
      require("../config");
    }).toThrow();
    process.env.TBD_USERNAME = orig;
  });

  it("reads values from env", () => {
    process.env.TBD_USERNAME = "user";
    process.env.TBD_PASSWORD = "pass";
    process.env.TBD_TOTP_SECRET = "SECRET";
    process.env.TBD_BASE_URL = "https://www.torrentbd.net";
    process.env.FLARESOLVERR_URL = "http://localhost:8191";
    process.env.PROXY_API_KEY = "key123";
    process.env.CACHE_TTL_SECONDS = "120";
    process.env.PORT = "5001";
    const { config } = require("../config");
    expect(config.tbdUsername).toBe("user");
    expect(config.cacheTtlSeconds).toBe(120);
    expect(config.port).toBe(5001);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
bun test src/test/config.test.ts
```

Expected: error (config module not found)

- [ ] **Step 7: Write src/config.ts**

```typescript
// src/config.ts
// Loads and validates all required environment variables at startup.
// Throws immediately if any required var is missing.

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  tbdUsername: required("TBD_USERNAME"),
  tbdPassword: required("TBD_PASSWORD"),
  tbdTotpSecret: required("TBD_TOTP_SECRET"),
  tbdBaseUrl: process.env.TBD_BASE_URL ?? "https://www.torrentbd.net",
  flareSolverrUrl: process.env.FLARESOLVERR_URL ?? "http://flaresolverr:8191",
  proxyApiKey: required("PROXY_API_KEY"),
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? "300"),
  port: Number(process.env.PORT ?? "5000"),
};
```

- [ ] **Step 8: Run test to verify it passes**

```bash
bun test src/test/config.test.ts
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: project scaffold and config module"
```

---

### Task 2: Category mapping

**Files:**

- Create: `src/categories.ts`
- Create: `src/test/categories.test.ts`

**Interfaces:**

- Consumes: nothing
- Produces:

  ```typescript
  // src/categories.ts
  export interface Category {
    tbdTitle: string;   // e.g. "Movies: Blu-Ray 720p" (from img title attr)
    torznabId: number;  // e.g. 2040
    group: string;      // e.g. "Movies" (sent to ajsearch.php)
  }

  export const CATEGORIES: Category[]

  // Given a comma-separated Torznab cat string like "2000,2040,5000",
  // returns unique TBD group names to use in ajsearch.php.
  // Returns [] if cats is empty/undefined (meaning: search all).
  export function torznabCatsToGroups(cats: string | undefined): string[]

  // Given a TBD category img title attr like "Movies: Blu-Ray 720p",
  // returns the matching torznabId, or 8000 (Other) if not found.
  export function tbdTitleToTorznabId(title: string): number
  ```

- [ ] **Step 1: Write the failing tests**

```typescript
// src/test/categories.test.ts
import { describe, it, expect } from "bun:test";
import { torznabCatsToGroups, tbdTitleToTorznabId, CATEGORIES } from "../categories";

describe("torznabCatsToGroups", () => {
  it("returns [] for undefined (search all)", () => {
    expect(torznabCatsToGroups(undefined)).toEqual([]);
  });

  it("returns [] for '0' (search all)", () => {
    expect(torznabCatsToGroups("0")).toEqual([]);
  });

  it("maps 2000 to Movies", () => {
    expect(torznabCatsToGroups("2000")).toContain("Movies");
  });

  it("maps 5000 to TV", () => {
    expect(torznabCatsToGroups("5000")).toContain("TV");
  });

  it("maps multiple cats, deduplicates groups", () => {
    // 2040 and 2050 both → Movies, so result has Movies once
    const groups = torznabCatsToGroups("2040,2050");
    expect(groups.filter(g => g === "Movies").length).toBe(1);
  });

  it("maps 1000-1999 to Games", () => {
    expect(torznabCatsToGroups("1010")).toContain("Games");
  });
});

describe("tbdTitleToTorznabId", () => {
  it("maps Movies: Blu-Ray 720p to 2040", () => {
    expect(tbdTitleToTorznabId("Movies: Blu-Ray 720p")).toBe(2040);
  });

  it("maps TV: Episodes - 720p | 1080p to 5040", () => {
    expect(tbdTitleToTorznabId("TV: Episodes - 720p | 1080p")).toBe(5040);
  });

  it("returns 8000 for unknown titles", () => {
    expect(tbdTitleToTorznabId("Something Unknown")).toBe(8000);
  });
});

describe("CATEGORIES", () => {
  it("has at least 40 entries", () => {
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/test/categories.test.ts
```

Expected: error (module not found)

- [ ] **Step 3: Write src/categories.ts**

```typescript
// src/categories.ts
// Maps between TorrentBD category names, Torznab category IDs, and
// TBD search group names (used in ajsearch.php torrentcats[] param).

export interface Category {
  tbdTitle: string;
  torznabId: number;
  group: string;
}

// tbdTitle matches the `title` attribute on img.cat-pic-img in TBD responses.
// Note: search results use "Movies: Blu-Ray 720p" format (colon, not dash).
// The Jackett definition uses dash format — we map both via normalization.
export const CATEGORIES: Category[] = [
  // Movies
  { tbdTitle: "Movies - Blu-Ray Lossless 4K",        torznabId: 2070, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray Lossless 1080p",      torznabId: 2060, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray 4K",                  torznabId: 2070, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray 1080p",               torznabId: 2050, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray 720p",                torznabId: 2040, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray SD",                  torznabId: 2030, group: "Movies" },
  { tbdTitle: "Movies - WEB-DL 4K",                  torznabId: 2070, group: "Movies" },
  { tbdTitle: "Movies - WEB-DL",                     torznabId: 2020, group: "Movies" },
  { tbdTitle: "Movies - WEBRip",                     torznabId: 2020, group: "Movies" },
  { tbdTitle: "Movies - HD-Rip",                     torznabId: 2040, group: "Movies" },
  { tbdTitle: "Movies - DVDRip",                     torznabId: 2030, group: "Movies" },
  { tbdTitle: "Movies - CAM | TS | DVDScr | Pre-DVD",torznabId: 2010, group: "Movies" },
  { tbdTitle: "Movies - 3D",                         torznabId: 2050, group: "Movies" },
  { tbdTitle: "Movies - Unrated",                    torznabId: 2000, group: "Movies" },
  { tbdTitle: "Movies - Packs",                      torznabId: 2000, group: "Movies" },
  // TV
  { tbdTitle: "TV - Episodes 4K",                    torznabId: 5070, group: "TV" },
  { tbdTitle: "TV - Episodes 720p | 1080p",          torznabId: 5040, group: "TV" },
  { tbdTitle: "TV - Episodes SD",                    torznabId: 5030, group: "TV" },
  { tbdTitle: "TV - Packs 4K",                       torznabId: 5070, group: "TV" },
  { tbdTitle: "TV - Packs - 720p | 1080p",           torznabId: 5040, group: "TV" },
  { tbdTitle: "TV - Packs SD",                       torznabId: 5030, group: "TV" },
  { tbdTitle: "TV - Awards | Ceremonies",            torznabId: 5000, group: "TV" },
  // Anime / Cartoons
  { tbdTitle: "Anime - All",                         torznabId: 5070, group: "Anime" },
  { tbdTitle: "Cartoons - All",                      torznabId: 5070, group: "TV" },
  // Games
  { tbdTitle: "Games - PC",                          torznabId: 1010, group: "Games" },
  { tbdTitle: "Games - Cracks | Patches",            torznabId: 1010, group: "Games" },
  { tbdTitle: "Games - Updates | DLC",               torznabId: 1010, group: "Games" },
  { tbdTitle: "Games - Backup",                      torznabId: 1010, group: "Games" },
  { tbdTitle: "Games - PlayStation",                 torznabId: 1040, group: "Games" },
  { tbdTitle: "Games - Xbox",                        torznabId: 1050, group: "Games" },
  { tbdTitle: "Games - Other",                       torznabId: 1000, group: "Games" },
  // Apps
  { tbdTitle: "Apps - PC",                           torznabId: 4010, group: "Apps" },
  { tbdTitle: "Apps - Mac",                          torznabId: 4020, group: "Apps" },
  { tbdTitle: "Apps - Linux",                        torznabId: 4030, group: "Apps" },
  { tbdTitle: "Apps - Android",                      torznabId: 4040, group: "Apps" },
  // Music
  { tbdTitle: "Music - Audio",                       torznabId: 3000, group: "Music" },
  { tbdTitle: "Music - Lossless",                    torznabId: 3040, group: "Music" },
  { tbdTitle: "Music - Video",                       torznabId: 3020, group: "Music" },
  { tbdTitle: "Music - Concerts | Live Shows",       torznabId: 3020, group: "Music" },
  { tbdTitle: "Music - Radio",                       torznabId: 3000, group: "Music" },
  // Books
  { tbdTitle: "Other - E-Books",                     torznabId: 7020, group: "Books" },
  { tbdTitle: "E-Books - Comics",                    torznabId: 7030, group: "Books" },
  { tbdTitle: "E-Books - Manga",                     torznabId: 7030, group: "Books" },
  // Sports
  { tbdTitle: "Sports - Football",                   torznabId: 5060, group: "Sports" },
  { tbdTitle: "Sports - Pro Wrestling",              torznabId: 5060, group: "Sports" },
  { tbdTitle: "Sports - All",                        torznabId: 5060, group: "Sports" },
  // Documentaries
  { tbdTitle: "Documentaries - All",                 torznabId: 5002, group: "Documentaries" },
  // Other
  { tbdTitle: "Tutorials - All",                     torznabId: 7000, group: "Tutorials" },
  { tbdTitle: "Other - Mobile Phone",                torznabId: 4040, group: "Other" },
  { tbdTitle: "Other - Religious",                   torznabId: 7000, group: "Other" },
  { tbdTitle: "Other - Miscellaneous",               torznabId: 7000, group: "Other" },
];

// Normalizes TBD's img title attribute to match CATEGORIES entries.
// TBD uses both "Movies: Blu-Ray 720p" (colon) and "Movies - Blu-Ray 720p" (dash).
function normalizeTbdTitle(title: string): string {
  // Replace first ": " with " - " to unify both formats
  return title.replace(/^([^:]+):\s+/, "$1 - ");
}

// Given a TBD img title attr (e.g. "Movies: Blu-Ray 720p"),
// returns the matching Torznab category ID. Falls back to 8000 (Other).
export function tbdTitleToTorznabId(title: string): number {
  const normalized = normalizeTbdTitle(title);
  return CATEGORIES.find(c => c.tbdTitle === normalized)?.torznabId ?? 8000;
}

// Maps Torznab category IDs to TBD group names for ajsearch.php.
// Range-based: 2000-2999 → Movies, 5000-5059 → TV, etc.
export function torznabCatsToGroups(cats: string | undefined): string[] {
  if (!cats || cats === "0") return [];
  const ids = cats.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
  const groups = new Set<string>();
  for (const id of ids) {
    if (id >= 2000 && id <= 2999) groups.add("Movies");
    else if (id >= 5000 && id <= 5059) groups.add("TV");
    else if (id === 5060) groups.add("Sports");
    else if (id >= 5070 && id <= 5079) groups.add("Anime");
    else if (id >= 1000 && id <= 1999) groups.add("Games");
    else if (id >= 4000 && id <= 4999) groups.add("Apps");
    else if (id >= 3000 && id <= 3999) groups.add("Music");
    else if (id >= 7000 && id <= 7999) groups.add("Books");
    else if (id === 5002) groups.add("Documentaries");
  }
  return [...groups];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/test/categories.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/categories.ts src/test/categories.test.ts
git commit -m "feat: category mapping — Torznab IDs to TBD group names"
```

---

### Task 3: In-memory cache

**Files:**

- Create: `src/cache.ts`
- Create: `src/test/cache.test.ts`

**Interfaces:**

- Consumes: `config.cacheTtlSeconds` from `src/config.ts`
- Produces:

  ```typescript
  // src/cache.ts
  export const cache: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
  }
  ```

- [ ] **Step 1: Write the failing tests**

```typescript
// src/test/cache.test.ts
import { describe, it, expect } from "bun:test";

describe("cache", () => {
  it("returns undefined for missing keys", async () => {
    process.env.TBD_USERNAME = "u";
    process.env.TBD_PASSWORD = "p";
    process.env.TBD_TOTP_SECRET = "S";
    process.env.PROXY_API_KEY = "k";
    const { cache } = await import("../cache");
    expect(cache.get("missing")).toBeUndefined();
  });

  it("stores and retrieves a value", async () => {
    const { cache } = await import("../cache");
    cache.set("key1", "<xml/>");
    expect(cache.get("key1")).toBe("<xml/>");
  });

  it("returns undefined after TTL expires", async () => {
    process.env.CACHE_TTL_SECONDS = "0";
    // Re-import with fresh TTL=0
    const mod = await import("../cache?bust=" + Date.now());
    mod.cache.set("expkey", "val");
    await new Promise(r => setTimeout(r, 10));
    expect(mod.cache.get("expkey")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/test/cache.test.ts
```

Expected: error (module not found)

- [ ] **Step 3: Write src/cache.ts**

```typescript
// src/cache.ts
// Simple in-memory TTL cache for Torznab XML search results.
// Keyed by "${query}|${cats}|${page}". No background cleanup — TTL
// is checked on read.

import { config } from "./config";

interface Entry {
  value: string;
  expiresAt: number;
}

const store = new Map<string, Entry>();

export const cache = {
  get(key: string): string | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  },

  set(key: string, value: string): void {
    store.set(key, {
      value,
      expiresAt: Date.now() + config.cacheTtlSeconds * 1000,
    });
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/test/cache.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cache.ts src/test/cache.test.ts
git commit -m "feat: in-memory TTL cache for search results"
```

---

### Task 4: FlareSolverr client

**Files:**

- Create: `src/flaresolverr.ts`

**Interfaces:**

- Consumes: `config.flareSolverrUrl` from `src/config.ts`
- Produces:

  ```typescript
  // src/flaresolverr.ts

  export interface FlareSolverrResult {
    cookies: Array<{ name: string; value: string }>;
    userAgent: string;
    responseBody: string;
    status: number;
  }

  // GET a URL through FlareSolverr. Returns cookies, UA, and response body.
  export async function flareGet(url: string): Promise<FlareSolverrResult>

  // POST a URL through FlareSolverr with form data.
  export async function flarePost(
    url: string,
    postData: string,   // URL-encoded form body
    cookies?: Array<{ name: string; value: string }>
  ): Promise<FlareSolverrResult>
  ```

No unit test for this module — it requires a live FlareSolverr. Integration tested in Task 6.

- [ ] **Step 1: Write src/flaresolverr.ts**

```typescript
// src/flaresolverr.ts
// Thin wrapper around the FlareSolverr v1 API.
// FlareSolverr docs: https://github.com/FlareSolverr/FlareSolverr

import { config } from "./config";

export interface FlareSolverrResult {
  cookies: Array<{ name: string; value: string }>;
  userAgent: string;
  responseBody: string;
  status: number;
}

interface FlareSolverrResponse {
  status: string;
  message: string;
  solution: {
    status: number;
    headers: Record<string, string>;
    response: string;
    cookies: Array<{ name: string; value: string }>;
    userAgent: string;
    url: string;
  };
}

async function callFlare(body: object): Promise<FlareSolverrResult> {
  const res = await fetch(`${config.flareSolverrUrl}/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`FlareSolverr HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as FlareSolverrResponse;

  if (data.status !== "ok") {
    throw new Error(`FlareSolverr error: ${data.message}`);
  }

  return {
    cookies: data.solution.cookies,
    userAgent: data.solution.userAgent,
    responseBody: data.solution.response,
    status: data.solution.status,
  };
}

export async function flareGet(url: string): Promise<FlareSolverrResult> {
  return callFlare({ cmd: "request.get", url, maxTimeout: 60000 });
}

export async function flarePost(
  url: string,
  postData: string,
  cookies?: Array<{ name: string; value: string }>
): Promise<FlareSolverrResult> {
  return callFlare({
    cmd: "request.post",
    url,
    postData,
    ...(cookies ? { cookies } : {}),
    maxTimeout: 60000,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/flaresolverr.ts
git commit -m "feat: FlareSolverr client wrapper"
```

---

### Task 5: Session manager (auto-login with TOTP)

**Files:**

- Create: `src/session.ts`

**Interfaces:**

- Consumes:
  - `config.tbdUsername`, `config.tbdPassword`, `config.tbdTotpSecret`, `config.tbdBaseUrl` from `src/config.ts`
  - `flareGet`, `flarePost` from `src/flaresolverr.ts`
- Produces:

  ```typescript
  // src/session.ts

  // Returns headers (Cookie + User-Agent) for an authenticated TBD request.
  // Auto-logins if no session exists. Call this before every TBD request.
  export async function getSessionHeaders(): Promise<Record<string, string>>

  // Call when a TBD response indicates session expiry (redirect to login).
  // Forces a re-login on the next getSessionHeaders() call.
  export function invalidateSession(): void
  ```

- [ ] **Step 1: Write src/session.ts**

```typescript
// src/session.ts
// Manages TorrentBD session cookies. Handles initial login via FlareSolverr
// and TOTP 2FA. Auto-re-logins when the session expires.

import { TOTP } from "otpauth";
import { config } from "./config";
import { flareGet, flarePost } from "./flaresolverr";

interface Session {
  cookies: Array<{ name: string; value: string }>;
  userAgent: string;
}

let session: Session | null = null;
// Prevent concurrent login attempts
let loginInProgress: Promise<void> | null = null;

// Generates the current 6-digit TOTP code from the configured secret.
function generateTotp(): string {
  const totp = new TOTP({ secret: config.tbdTotpSecret, algorithm: "SHA1", digits: 6, period: 30 });
  return totp.generate();
}

// Serializes cookies array to a Cookie header string.
function cookiesToHeader(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

async function doLogin(): Promise<void> {
  console.log("[session] Logging in via FlareSolverr...");

  // Step 1: GET homepage to get cf_clearance + UA
  const homeResult = await flareGet(`${config.tbdBaseUrl}/`);
  const baseCookies = homeResult.cookies;
  const userAgent = homeResult.userAgent;

  // Step 2: POST login credentials + TOTP
  // TorrentBD login endpoint — standard tracker pattern
  const totpCode = generateTotp();
  const loginBody = new URLSearchParams({
    username: config.tbdUsername,
    password: config.tbdPassword,
    totp_code: totpCode,  // ponytail: field name confirmed from common tracker patterns; may need adjustment
    returnto: "/",
  }).toString();

  const loginResult = await flarePost(
    `${config.tbdBaseUrl}/takelogin.php`,
    loginBody,
    baseCookies
  );

  // Merge cookies from both calls (login response overrides homepage cookies)
  const merged = new Map<string, string>();
  for (const c of [...baseCookies, ...loginResult.cookies]) {
    merged.set(c.name, c.value);
  }

  const allCookies = [...merged.entries()].map(([name, value]) => ({ name, value }));

  // Verify login succeeded by checking for session cookie presence
  const hasSessionCookie = allCookies.some(c => c.name === "user" || c.name === "x_auth");
  if (!hasSessionCookie) {
    throw new Error("[session] Login failed — session cookies not found. Check credentials/TOTP.");
  }

  session = { cookies: allCookies, userAgent };
  console.log("[session] Login successful.");
}

export async function getSessionHeaders(): Promise<Record<string, string>> {
  if (!session) {
    // Prevent concurrent logins
    if (!loginInProgress) loginInProgress = doLogin().finally(() => { loginInProgress = null; });
    await loginInProgress;
  }
  return {
    "Cookie": cookiesToHeader(session!.cookies),
    "User-Agent": session!.userAgent,
  };
}

export function invalidateSession(): void {
  console.log("[session] Session invalidated — will re-login on next request.");
  session = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/session.ts
git commit -m "feat: session manager with auto-login and TOTP 2FA"
```

---

### Task 6: TorrentBD HTTP client

**Files:**

- Create: `src/tbd-client.ts`

**Interfaces:**

- Consumes:
  - `getSessionHeaders`, `invalidateSession` from `src/session.ts`
  - `config.tbdBaseUrl` from `src/config.ts`
- Produces:

  ```typescript
  // src/tbd-client.ts

  // POST to ajsearch.php. Returns raw HTML string.
  export async function searchTorrents(
    query: string,
    groups: string[],  // TBD group names e.g. ["Movies", "TV"]
    page?: number
  ): Promise<string>

  // POST to ajgettorrents.php (latest/browse). Returns raw HTML string.
  export async function browseTorrents(page?: number): Promise<string>

  // GET download.php?id=X. Returns Response (stream the binary back).
  export async function downloadTorrent(id: string): Promise<Response>
  ```

- [ ] **Step 1: Write src/tbd-client.ts**

```typescript
// src/tbd-client.ts
// Makes authenticated HTTP requests to TorrentBD's AJAX endpoints.
// Detects session expiry (login redirect) and triggers re-login automatically.

import { config } from "./config";
import { getSessionHeaders, invalidateSession } from "./session";

const BASE = config.tbdBaseUrl;

// Detects if a response URL or HTML body indicates a login redirect.
function isLoginRedirect(html: string, finalUrl?: string): boolean {
  return (
    (finalUrl?.includes("account-login.php") ?? false) ||
    html.includes("account-login.php") ||
    html.includes("takelogin.php")
  );
}

// Makes an authenticated POST to a TBD AJAX endpoint.
// Retries once on session expiry.
async function tbdPost(path: string, body: URLSearchParams, attempt = 0): Promise<string> {
  const headers = await getSessionHeaders();
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": `${BASE}/`,
      "Origin": BASE,
    },
    body: body.toString(),
    redirect: "follow",
  });

  const html = await res.text();

  if (isLoginRedirect(html, res.url) && attempt === 0) {
    invalidateSession();
    return tbdPost(path, body, 1);
  }

  return html;
}

export async function searchTorrents(
  query: string,
  groups: string[],
  page = 1
): Promise<string> {
  const body = new URLSearchParams({
    page: String(page),
    kuddus_searchtype: "torrents",
    kuddus_searchkey: query,
    "searchParams[sortBy]": "",
    "searchParams[secondary_filters_extended]": "",
  });

  // Append category group array params (ajsearch.php expects repeated keys)
  for (const g of groups) {
    body.append("searchParams[torrentcats][]", g);
  }

  return tbdPost("ajsearch.php", body);
}

export async function browseTorrents(page = 1): Promise<string> {
  const body = new URLSearchParams({
    page: String(page),
    origin: "home",
    sortBy: "",
    order: "",
    query: "",
    fl: "false",
    intRelease: "false",
    active: "false",
    spCat: "",
    sf: "",
    initialList: "1",
    uid: "",
    count: "",
    mto: "false",
  });

  return tbdPost("ajgettorrents.php", body);
}

export async function downloadTorrent(id: string): Promise<Response> {
  const headers = await getSessionHeaders();
  const res = await fetch(`${BASE}/download.php?id=${id}`, {
    headers,
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }

  // Re-login and retry once if redirected to login
  if (res.url.includes("account-login.php")) {
    invalidateSession();
    const headers2 = await getSessionHeaders();
    return fetch(`${BASE}/download.php?id=${id}`, { headers: headers2, redirect: "follow" });
  }

  return res;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tbd-client.ts
git commit -m "feat: TorrentBD HTTP client with session retry"
```

---

### Task 7: HTML parser

**Files:**

- Create: `src/parser.ts`
- Create: `src/test/parser.test.ts`

**Interfaces:**

- Consumes: `tbdTitleToTorznabId` from `src/categories.ts`
- Produces:

  ```typescript
  // src/parser.ts

  export interface TorrentItem {
    id: string;
    title: string;
    torznabCategoryId: number;
    sizeBytes: number;
    seeders: number;
    leechers: number;
    grabs: number;
    publishDate: Date;
    freeleech: boolean;
    downloadPath: string; // e.g. "download.php?id=1279583"
  }

  // Parses ajsearch.php HTML response → array of TorrentItem
  export function parseSearchResults(html: string): TorrentItem[]

  // Parses ajgettorrents.php HTML response → array of TorrentItem
  export function parseBrowseResults(html: string): TorrentItem[]
  ```

- [ ] **Step 1: Write the failing tests**

```typescript
// src/test/parser.test.ts
import { describe, it, expect } from "bun:test";
import { parseSearchResults, parseBrowseResults } from "../parser";

// Minimal realistic HTML from HAR analysis
const SEARCH_HTML = `
<h6 class="kuddus-results-counter">&#x1F50D; 14134</h6>
<table class="kuddus-torrents-table">
  <tr>
    <td><img class="cat-pic-img" src="images/categories/v3/i_movies_720p.png" title="Movies: Blu-Ray 720p"></td>
    <td>
      <div class="mb-7 block">
        <a href="torrents-details.php?id=1279583&hit=1" class="ttorr-title">End of Days 1999 720p BluRay DD5.1 x264</a>
        <img class="rel-icon" src="images/free.gif" alt="FL" title="FreeLeech">
      </div>
      <div class="blue100 inline-block" title="File Size"><i class="material-icons">insert_drive_file</i> 8.83 GiB</div>
      <div class="uploaded-by inline-block">Uploaded by <a href="#">User</a>,
        <span title="2025-09-24 08:42 PM">11mo ago</span>
      </div>
      <div>
        <div class="thc seed inline" title="Seeders online"><i class="material-icons">file_upload</i> 5</div>
        <div class="thc leech inline" title="Leechers"><i class="material-icons">file_download</i> 2</div>
        <div class="thc completed inline" title="Total completed"><i class="material-icons">done_all</i> 7</div>
      </div>
    </td>
    <td><a href="download.php?id=1279583"><i class="material-icons small">file_download</i></a></td>
  </tr>
</table>
`;

const BROWSE_HTML = `
<table class="torrents-table">
  <tbody>
    <tr>
      <td class="tab-sortable hide-on-small-only" onclick="mtt.getSpCatTorrents(10)">
        <img class="cat-pic-img" src="images/categories/v3/i_games_pc_3.png" title="Games: PC">
      </td>
      <td class="torrent-name">
        <span class="dl-sc-trg fx" data-type="torrent" data-tid="1326862">
          <a href="torrents-details.php?id=1326862&hit=1">Forza Horizon 5 Ultimate Edition</a>
        </span>
        <img src="images/free.gif" alt="FL" title="FreeLeech">
        <span class="torrent-added-on" title="2026-08-08 06:06 PM">29d ago</span>
      </td>
      <td><a href="https://www.torrentbd.net/download.php?id=1326862"><i class="material-icons small">file_download</i></a></td>
      <td></td>
      <td></td>
      <td>12.5 GB</td>
      <td>3</td>
      <td>1</td>
      <td>42</td>
    </tr>
  </tbody>
</table>
`;

describe("parseSearchResults", () => {
  it("returns one item from minimal HTML", () => {
    const items = parseSearchResults(SEARCH_HTML);
    expect(items.length).toBe(1);
  });

  it("extracts id", () => {
    expect(parseSearchResults(SEARCH_HTML)[0].id).toBe("1279583");
  });

  it("extracts title", () => {
    expect(parseSearchResults(SEARCH_HTML)[0].title).toBe("End of Days 1999 720p BluRay DD5.1 x264");
  });

  it("maps category to torznab ID", () => {
    // Movies: Blu-Ray 720p → 2040
    expect(parseSearchResults(SEARCH_HTML)[0].torznabCategoryId).toBe(2040);
  });

  it("parses size to bytes", () => {
    // 8.83 GiB = 8.83 * 1024^3
    const expected = Math.round(8.83 * 1024 ** 3);
    const actual = parseSearchResults(SEARCH_HTML)[0].sizeBytes;
    expect(Math.abs(actual - expected)).toBeLessThan(1000);
  });

  it("parses seeders and leechers", () => {
    const item = parseSearchResults(SEARCH_HTML)[0];
    expect(item.seeders).toBe(5);
    expect(item.leechers).toBe(2);
  });

  it("detects freeleech", () => {
    expect(parseSearchResults(SEARCH_HTML)[0].freeleech).toBe(true);
  });

  it("extracts download path", () => {
    expect(parseSearchResults(SEARCH_HTML)[0].downloadPath).toContain("1279583");
  });

  it("returns empty array for empty HTML", () => {
    expect(parseSearchResults("<html></html>")).toEqual([]);
  });
});

describe("parseBrowseResults", () => {
  it("returns one item", () => {
    expect(parseBrowseResults(BROWSE_HTML).length).toBe(1);
  });

  it("extracts id from browse", () => {
    expect(parseBrowseResults(BROWSE_HTML)[0].id).toBe("1326862");
  });

  it("extracts seeders from column", () => {
    expect(parseBrowseResults(BROWSE_HTML)[0].seeders).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/test/parser.test.ts
```

Expected: error (module not found)

- [ ] **Step 3: Write src/parser.ts**

```typescript
// src/parser.ts
// Parses TorrentBD HTML responses into structured TorrentItem objects.
// Uses cheerio for DOM traversal. Selectors confirmed from HAR analysis.

import * as cheerio from "cheerio";
import { tbdTitleToTorznabId } from "./categories";

export interface TorrentItem {
  id: string;
  title: string;
  torznabCategoryId: number;
  sizeBytes: number;
  seeders: number;
  leechers: number;
  grabs: number;
  publishDate: Date;
  freeleech: boolean;
  downloadPath: string;
}

// Parses "8.83 GiB", "1.23 GB", "512 MB" etc. to bytes.
function parseSize(text: string): number {
  const clean = text.replace(/[^\d.A-Za-z]/g, " ").trim();
  const match = clean.match(/([\d.]+)\s*(TiB|GiB|MiB|KiB|TB|GB|MB|KB)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const units: Record<string, number> = {
    KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4,
    KB: 1000, MB: 1000 ** 2, GB: 1000 ** 3, TB: 1000 ** 4,
  };
  return Math.round(num * (units[unit] ?? 0));
}

// Extracts integer from text like "\n  5\n" (icon text + number).
function parseCount(text: string): number {
  const match = text.replace(/[^\d]/g, " ").trim().match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// Extracts torrent ID from href like "torrents-details.php?id=1279583&hit=1"
function extractId(href: string): string {
  return new URLSearchParams(href.split("?")[1] ?? "").get("id") ?? "";
}

// Extracts download path from href (may be full URL or relative)
function extractDownloadPath(href: string): string {
  // Normalize to just "download.php?id=X"
  const match = href.match(/download\.php\?id=(\d+)/);
  return match ? `download.php?id=${match[1]}` : href;
}

// Parses a date string like "2025-09-24 08:42 PM" to a Date.
function parseDate(dateStr: string): Date {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function parseSearchResults(html: string): TorrentItem[] {
  const $ = cheerio.load(html);
  const items: TorrentItem[] = [];

  $("table.kuddus-torrents-table tr").each((_, row) => {
    const $row = $(row);

    const catTitle = $row.find("img.cat-pic-img").attr("title") ?? "";
    const titleEl = $row.find("a.ttorr-title");
    const title = titleEl.text().trim();
    const detailHref = titleEl.attr("href") ?? "";
    const id = extractId(detailHref);
    if (!id || !title) return; // skip malformed rows

    const sizeText = $row.find(".blue100[title='File Size']").text();
    const seeders = parseCount($row.find(".thc.seed").text());
    const leechers = parseCount($row.find(".thc.leech").text());
    const grabs = parseCount($row.find(".thc.completed").text());
    const dateStr = $row.find(".uploaded-by span[title]").attr("title") ?? "";
    const freeleech = $row.find('img[src*="free.gif"]').length > 0;
    const dlHref = $row.find('a[href*="download.php"]').attr("href") ?? "";

    items.push({
      id,
      title,
      torznabCategoryId: tbdTitleToTorznabId(catTitle),
      sizeBytes: parseSize(sizeText),
      seeders,
      leechers,
      grabs,
      publishDate: parseDate(dateStr),
      freeleech,
      downloadPath: extractDownloadPath(dlHref),
    });
  });

  return items;
}

export function parseBrowseResults(html: string): TorrentItem[] {
  const $ = cheerio.load(html);
  const items: TorrentItem[] = [];

  $("table.torrents-table > tbody > tr").each((_, row) => {
    const $row = $(row);

    const catTitle = $row.find("img.cat-pic-img").attr("title") ?? "";
    const titleEl = $row.find("td.torrent-name a[href*='torrents-details']");
    const title = titleEl.text().trim();
    const detailHref = titleEl.attr("href") ?? "";
    const id = extractId(detailHref);
    if (!id || !title) return;

    const sizeText = $row.find("td:nth-child(6)").text().trim();
    const seeders = parseInt($row.find("td:nth-child(7)").text().trim(), 10) || 0;
    const leechers = parseInt($row.find("td:nth-child(8)").text().trim(), 10) || 0;
    const grabs = parseInt($row.find("td:nth-child(9)").text().trim(), 10) || 0;
    const dateStr = $row.find(".torrent-added-on").attr("title") ?? "";
    const freeleech = $row.find('img[src*="free.gif"]').length > 0;
    const dlHref = $row.find('a[href*="download.php"]').attr("href") ?? "";

    items.push({
      id,
      title,
      torznabCategoryId: tbdTitleToTorznabId(catTitle),
      sizeBytes: parseSize(sizeText),
      seeders,
      leechers,
      grabs,
      publishDate: parseDate(dateStr),
      freeleech,
      downloadPath: extractDownloadPath(dlHref),
    });
  });

  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/test/parser.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser.ts src/test/parser.test.ts
git commit -m "feat: HTML parser for search and browse results"
```

---

### Task 8: Torznab XML builder

**Files:**

- Create: `src/torznab.ts`
- Create: `src/test/torznab.test.ts`

**Interfaces:**

- Consumes: `TorrentItem` from `src/parser.ts`, `CATEGORIES` from `src/categories.ts`
- Produces:

  ```typescript
  // src/torznab.ts

  // Returns the Torznab caps XML string.
  export function buildCapsXml(): string

  // Returns a Torznab search results RSS XML string.
  export function buildSearchXml(
    items: TorrentItem[],
    proxyBaseUrl: string,  // e.g. "http://localhost:5000"
    apiKey: string
  ): string

  // Returns a Torznab error XML string.
  export function buildErrorXml(code: number, description: string): string
  ```

- [ ] **Step 1: Write the failing tests**

```typescript
// src/test/torznab.test.ts
import { describe, it, expect } from "bun:test";
import { buildCapsXml, buildSearchXml, buildErrorXml } from "../torznab";
import type { TorrentItem } from "../parser";

const SAMPLE_ITEM: TorrentItem = {
  id: "1279583",
  title: "End of Days 1999 720p BluRay",
  torznabCategoryId: 2040,
  sizeBytes: 9481369067,
  seeders: 5,
  leechers: 2,
  grabs: 7,
  publishDate: new Date("2025-09-24T20:42:00Z"),
  freeleech: true,
  downloadPath: "download.php?id=1279583",
};

describe("buildCapsXml", () => {
  it("returns valid XML with caps element", () => {
    const xml = buildCapsXml();
    expect(xml).toContain("<caps>");
    expect(xml).toContain("</caps>");
  });

  it("includes searching element", () => {
    expect(buildCapsXml()).toContain("<searching>");
  });

  it("includes movie-search", () => {
    expect(buildCapsXml()).toContain("movie-search");
  });

  it("includes categories", () => {
    expect(buildCapsXml()).toContain("<categories>");
  });

  it("includes Movies category id 2000", () => {
    expect(buildCapsXml()).toContain('id="2000"');
  });
});

describe("buildSearchXml", () => {
  it("returns RSS XML", () => {
    const xml = buildSearchXml([SAMPLE_ITEM], "http://proxy:5000", "key");
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("</rss>");
  });

  it("includes torrent title", () => {
    const xml = buildSearchXml([SAMPLE_ITEM], "http://proxy:5000", "key");
    expect(xml).toContain("End of Days 1999 720p BluRay");
  });

  it("includes proxy download link", () => {
    const xml = buildSearchXml([SAMPLE_ITEM], "http://proxy:5000", "key");
    expect(xml).toContain("http://proxy:5000/download?id=1279583");
    expect(xml).toContain("apikey=key");
  });

  it("includes size in bytes", () => {
    const xml = buildSearchXml([SAMPLE_ITEM], "http://proxy:5000", "key");
    expect(xml).toContain("9481369067");
  });

  it("sets downloadvolumefactor to 0 for freeleech", () => {
    const xml = buildSearchXml([SAMPLE_ITEM], "http://proxy:5000", "key");
    expect(xml).toContain('name="downloadvolumefactor" value="0"');
  });

  it("returns empty channel for no items", () => {
    const xml = buildSearchXml([], "http://proxy:5000", "key");
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });
});

describe("buildErrorXml", () => {
  it("returns error XML with code and description", () => {
    const xml = buildErrorXml(100, "Something went wrong");
    expect(xml).toContain("error");
    expect(xml).toContain("100");
    expect(xml).toContain("Something went wrong");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/test/torznab.test.ts
```

Expected: error (module not found)

- [ ] **Step 3: Write src/torznab.ts**

```typescript
// src/torznab.ts
// Builds Torznab-compliant XML responses for Prowlarr.
// Torznab spec: http://torznab.com/schemas/2015/feed

import { CATEGORIES } from "./categories";
import type { TorrentItem } from "./parser";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// RFC 2822 date format for pubDate
function toRfc2822(date: Date): string {
  return date.toUTCString();
}

// Build the top-level category tree for caps (deduplicated by torznabId parent)
function buildCategoryElements(): string {
  const parents = new Map<number, Set<number>>();
  const parentNames: Map<number, string> = new Map([
    [1000, "PC/Games"], [2000, "Movies"], [3000, "Audio"],
    [4000, "PC"], [5000, "TV"], [7000, "Books"], [8000, "Other"],
  ]);

  for (const cat of CATEGORIES) {
    const parentId = Math.floor(cat.torznabId / 1000) * 1000;
    if (!parents.has(parentId)) parents.set(parentId, new Set());
    parents.get(parentId)!.add(cat.torznabId);
  }

  return [...parents.entries()]
    .sort(([a], [b]) => a - b)
    .map(([parentId, subIds]) => {
      const subcats = [...subIds]
        .filter(id => id !== parentId)
        .sort()
        .map(id => {
          const cat = CATEGORIES.find(c => c.torznabId === id);
          return `    <subcat id="${id}" name="${xmlEscape(cat?.tbdTitle ?? String(id))}"/>`;
        })
        .join("\n");
      return `  <category id="${parentId}" name="${xmlEscape(parentNames.get(parentId) ?? String(parentId))}">\n${subcats}\n  </category>`;
    })
    .join("\n");
}

export function buildCapsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
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
${buildCategoryElements()}
  </categories>
</caps>`;
}

export function buildSearchXml(
  items: TorrentItem[],
  proxyBaseUrl: string,
  apiKey: string
): string {
  const itemsXml = items.map(item => {
    const guid = `https://www.torrentbd.net/torrents-details.php?id=${item.id}`;
    const dlUrl = `${proxyBaseUrl}/download?id=${item.id}&apikey=${apiKey}`;
    const peers = item.seeders + item.leechers;

    return `    <item>
      <title>${xmlEscape(item.title)}</title>
      <guid>${xmlEscape(guid)}</guid>
      <link>${xmlEscape(dlUrl)}</link>
      <pubDate>${toRfc2822(item.publishDate)}</pubDate>
      <torznab:attr name="category" value="${item.torznabCategoryId}"/>
      <torznab:attr name="size" value="${item.sizeBytes}"/>
      <torznab:attr name="seeders" value="${item.seeders}"/>
      <torznab:attr name="peers" value="${peers}"/>
      <torznab:attr name="grabs" value="${item.grabs}"/>
      <torznab:attr name="downloadvolumefactor" value="${item.freeleech ? 0 : 1}"/>
      <torznab:attr name="uploadvolumefactor" value="1"/>
    </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <title>TorrentBD</title>
${itemsXml}
  </channel>
</rss>`;
}

export function buildErrorXml(code: number, description: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<error code="${code}" description="${xmlEscape(description)}"/>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/test/torznab.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/torznab.ts src/test/torznab.test.ts
git commit -m "feat: Torznab XML builder — caps, search results, error"
```

---

### Task 9: Hono app + routes

**Files:**

- Create: `src/index.ts`

**Interfaces:**

- Consumes: all previous modules
- Produces: running Hono server on `config.port`

- [ ] **Step 1: Write src/index.ts**

```typescript
// src/index.ts
// Hono app wiring. Exposes Torznab API and download proxy endpoints.

import { Hono } from "hono";
import { config } from "./config";
import { torznabCatsToGroups } from "./categories";
import { searchTorrents, browseTorrents, downloadTorrent } from "./tbd-client";
import { parseSearchResults, parseBrowseResults } from "./parser";
import { buildCapsXml, buildSearchXml, buildErrorXml } from "./torznab";
import { cache } from "./cache";

const app = new Hono();

// Health check for Docker
app.get("/health", c => c.json({ status: "ok" }));

// API key auth middleware for /api and /download
function requireApiKey(c: any, next: () => Promise<void>): Promise<Response> | Response {
  const key = c.req.query("apikey");
  if (key !== config.proxyApiKey) {
    return c.text("Forbidden: invalid apikey", 403);
  }
  return next();
}

// Main Torznab endpoint
app.get("/api", requireApiKey, async c => {
  const t = c.req.query("t");

  // Caps
  if (t === "caps") {
    return c.text(buildCapsXml(), 200, { "Content-Type": "application/xml; charset=utf-8" });
  }

  // Search (search, tvsearch, movie, music, book — all handled identically)
  if (t === "search" || t === "tvsearch" || t === "movie" || t === "music" || t === "book") {
    const query = c.req.query("q") ?? "";
    const cats = c.req.query("cat");
    const page = parseInt(c.req.query("offset") ?? "0", 10);
    // Torznab offset is 0-based, TBD page is 1-based (100 items/page)
    const tbdPage = Math.floor(page / 100) + 1;

    const cacheKey = `${query}|${cats ?? ""}|${tbdPage}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return c.text(cached, 200, { "Content-Type": "application/xml; charset=utf-8" });
    }

    try {
      const groups = torznabCatsToGroups(cats);
      let html: string;

      if (!query && groups.length === 0) {
        html = await browseTorrents(tbdPage);
      } else {
        html = await searchTorrents(query, groups, tbdPage);
      }

      // Pick the right parser based on which endpoint was used
      const items = !query && groups.length === 0
        ? parseBrowseResults(html)
        : parseSearchResults(html);

      const proxyBase = new URL(c.req.url).origin;
      const xml = buildSearchXml(items, proxyBase, config.proxyApiKey);

      cache.set(cacheKey, xml);
      return c.text(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
    } catch (err) {
      console.error("[/api] Error:", err);
      const errXml = buildErrorXml(100, String(err));
      return c.text(errXml, 500, { "Content-Type": "application/xml; charset=utf-8" });
    }
  }

  // Unknown t= value
  return c.text(buildErrorXml(202, `Unknown function: ${t}`), 400, {
    "Content-Type": "application/xml; charset=utf-8",
  });
});

// Torrent download proxy
app.get("/download", requireApiKey, async c => {
  const id = c.req.query("id");
  if (!id) return c.text("Missing id", 400);

  try {
    const upstream = await downloadTorrent(id);
    // Stream the binary response back to Prowlarr
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/x-bittorrent",
        "Content-Disposition": upstream.headers.get("Content-Disposition") ?? `attachment; filename="${id}.torrent"`,
      },
    });
  } catch (err) {
    console.error("[/download] Error:", err);
    return c.text(`Download failed: ${err}`, 502);
  }
});

console.log(`[torrentbd-proxy] Starting on port ${config.port}`);
export default { port: config.port, fetch: app.fetch };
```

- [ ] **Step 2: Smoke test — run locally**

```bash
# Set minimal env vars
export TBD_USERNAME=test TBD_PASSWORD=test TBD_TOTP_SECRET=JBSWY3DPEHPK3PXP PROXY_API_KEY=testkey

bun src/index.ts &
sleep 1

# Test health
curl -s http://localhost:5000/health

# Test caps
curl -s "http://localhost:5000/api?t=caps&apikey=testkey" | head -20

# Test missing apikey → 403
curl -s -o /dev/null -w "%{http_code}" "http://localhost:5000/api?t=caps"

kill %1
```

Expected: `{"status":"ok"}`, XML caps output, `403`

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: Hono app with Torznab routes and download proxy"
```

---

### Task 10: Docker packaging

**Files:**

- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY src ./src
COPY tsconfig.json ./
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1
CMD ["bun", "src/index.ts"]
```

- [ ] **Step 2: Write docker-compose.yml**

```yaml
services:
  torrentbd-proxy:
    build: .
    ports:
      - "5000:5000"
    env_file: .env
    environment:
      - PORT=5000
    restart: unless-stopped
```

- [ ] **Step 3: Write .env (from .env.example) and build**

```bash
cp .env.example .env
# Edit .env with real credentials, then:
docker compose build
docker compose up -d
docker compose logs -f torrentbd-proxy
```

Expected: server starts, `/health` returns `{"status":"ok"}`

- [ ] **Step 4: Test caps endpoint from outside container**

```bash
curl -s "http://localhost:5000/api?t=caps&apikey=YOUR_KEY" | grep -c "<category"
```

Expected: number > 5

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example
git commit -m "feat: Docker packaging"
```

---

### Task 11: Run all tests + Prowlarr wiring

**Files:** none new — validation only

- [ ] **Step 1: Run full test suite**

```bash
bun test
```

Expected: all tests PASS

- [ ] **Step 2: Add TorrentBD to Prowlarr**

1. Prowlarr → Indexers → Add Indexer → Generic Torznab
2. Name: `TorrentBD`
3. URL: `http://<your-host>:5000`
4. API Path: `/api`
5. API Key: value of `PROXY_API_KEY` from your `.env`
6. Click **Test** → should return green ✓
7. Click **Save**

- [ ] **Step 3: Verify search works**

In Prowlarr, search for "avengers" — should return results from TorrentBD with categories, sizes, seeders.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final integration verified"
```

---

## Self-Review Notes

**Spec coverage:**

- ✅ All 5 endpoints covered (caps, search, tvsearch, movie, download, health)
- ✅ Auto-login with TOTP (Task 5)
- ✅ Session expiry detection + retry (Tasks 5, 6)
- ✅ FlareSolverr wrapper (Task 4)
- ✅ HTML parsing for both ajsearch.php and ajgettorrents.php (Task 7)
- ✅ Category mapping 50+ cats (Task 2)
- ✅ Torznab XML — caps + search + error (Task 8)
- ✅ In-memory cache (Task 3)
- ✅ Download proxy (Tasks 6, 9)
- ✅ Docker + docker-compose (Task 10)
- ✅ API key auth (Task 9)
- ⚠️ Login endpoint field names (`totp_code`, `takelogin.php`) marked with `ponytail:` comment — confirm from a login HAR if login fails

**Known gap:** The exact login form field names (`totp_code`, form action `takelogin.php`) are inferred from common tracker patterns. If login fails in Task 11, capture a HAR of a manual login and adjust `src/session.ts` accordingly. This is the only unconfirmed detail.
