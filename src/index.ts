// src/index.ts
// Hono app entry point. Exposes Torznab API, torrent download proxy and the
// dashboard UI used by Prowlarr and by humans.

import { Hono } from "hono";
import type { Context, Next } from "hono";
import { config } from "./config";
import { torznabCatsToGroups } from "./categories";
import {
  searchTorrents,
  browseTorrents,
  downloadTorrent,
  fetchReseedPage,
} from "./tbd-client";
import { parseSearchResults, parseBrowseResults, type TorrentItem } from "./parser";
import { parseReseedPage } from "./reseed-parser";
import { createReseedStore, type ReseedStore } from "./reseed-store";
import {
  createReseedSynchronizer,
  type ReseedSynchronizer,
} from "./reseed-sync";
import { buildCapsXml, buildSearchXml, buildErrorXml } from "./torznab";
import { cache } from "./cache";
import { runtimeStatus } from "./status";
import { renderDashboard } from "./dashboard";
import { renderReseedDashboard } from "./reseed-dashboard";
import { runAllFeatureChecks, startPeriodicHealthChecks } from "./health-check";
import { rateLimit, getClientIp } from "./rate-limit";
import {
  requireApiKey,
  requireDashboardAuth,
  dashboardAuthRequired,
} from "./auth";
import { logger, redact } from "./logger";
import { metrics } from "./metrics";
import { singleFlight } from "./inflight";

const XML_CT = { "Content-Type": "application/xml; charset=utf-8" };
const APP_VERSION = "1.1.0";

let reseedStore = createReseedStore(config.reseedDbPath);
let reseedSynchronizer = createReseedSynchronizer({
  baseUrl: config.tbdBaseUrl,
  fetchPage: fetchReseedPage,
  parsePage: parseReseedPage,
  store: reseedStore,
  record: (level, msg) => runtimeStatus.record(level, msg),
});

function setReseedSynchronizer(sync: ReseedSynchronizer): void {
  reseedSynchronizer = sync;
}

function setReseedStore(store: ReseedStore): void {
  reseedStore = store;
}

// Shared torrent download handler for proxy and reseed download routes
async function torrentDownloadResponse(
  id: string,
  downloader: typeof downloadTorrent = downloadTorrent,
): Promise<Response> {
  try {
    metrics.download();
    const upstream = await downloader(id);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "application/x-bittorrent",
        "Content-Disposition":
          upstream.headers.get("Content-Disposition") ??
          `attachment; filename="${id}.torrent"`,
      },
    });
  } catch (err) {
    logger.error("download", `Error downloading ${id}: ${String(err)}`);
    runtimeStatus.record("error", `[download] Error: ${String(err)}`);
    return new Response(`Download failed: ${String(err)}`, { status: 502 });
  }
}

export interface AppDeps {
  reseedStore?: ReseedStore;
  reseedSynchronizer?: ReseedSynchronizer;
  downloader?: typeof downloadTorrent;
}

/** Derive a safe absolute base URL for enclosure links. */
function getProxyBase(c: Context): string {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  const rawHost = c.req.header("host") ?? new URL(c.req.url).host;
  // Reject anything that is not a plain host[:port] to avoid header injection.
  if (!/^[A-Za-z0-9.\-:[\]]+$/.test(rawHost)) {
    return `http://localhost:${config.port}`;
  }
  const proto = c.req.header("x-forwarded-proto")?.toLowerCase();
  const scheme = proto === "https" || proto === "http" ? proto : "http";
  return `${scheme}://${rawHost}`;
}

/** Map Torznab search parameters onto a TorrentBD search string. */
function buildSearchQuery(c: Context): string {
  let q = c.req.query("q")?.trim() ?? "";
  const imdbid = c.req.query("imdbid");
  const tmdbid = c.req.query("tmdbid");
  const season = c.req.query("season");
  const episode = c.req.query("ep");
  const artist = c.req.query("artist");
  const album = c.req.query("album");
  const author = c.req.query("author");

  if (!q && imdbid) q = `imdb:${imdbid}`;
  if (!q && tmdbid) q = `tmdb:${tmdbid}`;
  if (!q && (artist || album)) q = [artist, album].filter(Boolean).join(" ");
  if (!q && author) q = author;

  if (season) {
    const seasonTag = `S${String(season).padStart(2, "0")}`;
    const epTag = episode ? `E${String(episode).padStart(2, "0")}` : "";
    const tag = `${seasonTag}${epTag}`;
    if (q && !q.toUpperCase().includes(tag)) q = `${q} ${tag}`;
  }
  return q;
}

interface SearchResult {
  items: TorrentItem[];
  proxyBase: string;
}

/** Shared search pipeline used by both Torznab XML and the UI JSON endpoint. */
async function runSearch(c: Context): Promise<SearchResult> {
  const query = buildSearchQuery(c);
  const cats = c.req.query("cat");
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const tbdPage = Number.isFinite(offset) ? Math.floor(offset / 100) + 1 : 1;
  const proxyBase = getProxyBase(c);

  // Cache parsed items rather than final XML: one entry per query, no host
  // fragmentation, and enclosure URLs are always built for the current host.
  const cacheKey = `items|${query}|${cats ?? ""}|${tbdPage}`;
  let items: TorrentItem[] | undefined;
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      // JSON round-trips Date objects into strings — revive them before use.
      const parsed = JSON.parse(cached) as Array<Omit<TorrentItem, "publishDate"> & { publishDate: string | number }>;
      items = parsed.map((item) => ({
        ...item,
        publishDate: new Date(item.publishDate),
      }));
      metrics.cacheHit();
    } catch {
      items = undefined;
    }
  }

  if (!items) {
    metrics.cacheMiss();
    items = await singleFlight(cacheKey, async () => {
      const groups = torznabCatsToGroups(cats);
      const useSearch = query || groups.length > 0;
      const html = useSearch
        ? await searchTorrents(query, groups, tbdPage)
        : await browseTorrents(tbdPage);

      const seen = new Set<string>();
      return (
        useSearch ? parseSearchResults(html) : parseBrowseResults(html)
      )
        .filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        })
        .slice(0, 100);
    });
    cache.set(cacheKey, JSON.stringify(items));
  }

  metrics.search();
  return { items, proxyBase };
}

function withUiSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; connect-src 'self'; font-src 'self' data:",
  );
  return new Response(response.body, { status: response.status, headers });
}

async function serveUiFile(name: string, contentType: string): Promise<Response> {
  try {
    const file = Bun.file(new URL(`./ui/${name}`, import.meta.url));
    if (!(await file.exists())) throw new Error("not found");
    return withUiSecurityHeaders(
      new Response(file, { headers: { "Content-Type": contentType } }),
    );
  } catch {
    // UI files are optional at test time — fall back to the legacy dashboard.
    return withUiSecurityHeaders(
      new Response(renderDashboard(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );
  }
}

function createApp(deps?: AppDeps): Hono {
  const app = new Hono();

  const getStore = () => deps?.reseedStore ?? reseedStore;
  const getSynchronizer = () => deps?.reseedSynchronizer ?? reseedSynchronizer;
  const getDownloader = () => deps?.downloader ?? downloadTorrent;

  // Request logging + metrics. Secrets are redacted before anything is logged.
  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    logger.debug("http", `${c.req.method} ${redact(c.req.url)}`);
    await next();
    const durationMs = Date.now() - startedAt;
    metrics.request(c.res.status);
    const logMsg = `${c.req.method} ${c.req.path} -> ${c.res.status} (${durationMs}ms)`;
    logger.info("http", logMsg);
    if (
      !["/status", "/health", "/metrics", "/api/ui/status"].includes(c.req.path)
    ) {
      runtimeStatus.record("info", logMsg);
    }
  });

  // ---------------------------------------------------------------- Health
  app.get("/health", (c) => c.json({ status: "ok" }));

  // ------------------------------------------------------------ Dashboard UI
  app.get("/", () => serveUiFile("index.html", "text/html; charset=utf-8"));
  app.get("/ui", () => serveUiFile("index.html", "text/html; charset=utf-8"));
  app.get("/ui/index.html", () =>
    serveUiFile("index.html", "text/html; charset=utf-8"),
  );
  app.get("/ui/styles.css", () =>
    serveUiFile("styles.css", "text/css; charset=utf-8"),
  );
  app.get("/ui/app.js", () =>
    serveUiFile("app.js", "text/javascript; charset=utf-8"),
  );

  app.get("/status", requireDashboardAuth, (c) =>
    c.json(runtimeStatus.snapshot()),
  );

  app.get("/metrics", requireDashboardAuth, (c) =>
    c.json({ ...metrics.snapshot(), status: runtimeStatus.snapshot() }),
  );

  app.post("/test", requireDashboardAuth, async (c) => {
    try {
      await runAllFeatureChecks();
      return c.json({ ok: true, features: runtimeStatus.snapshot().features });
    } catch (err) {
      return c.json({ ok: false, error: String(err) }, 500);
    }
  });

  // ------------------------------------------------ Legacy reseed dashboard
  app.get("/reseed", requireDashboardAuth, (c) =>
    c.html(renderReseedDashboard()),
  );

  app.get("/reseed-ui.js", requireDashboardAuth, () => {
    return new Response(Bun.file(new URL("./reseed-ui.js", import.meta.url)), {
      headers: { "Content-Type": "text/javascript; charset=utf-8" },
    });
  });

  app.get("/reseed-data", requireDashboardAuth, (c) => {
    const store = getStore();
    const requests = store.list();
    return c.json({
      requests,
      count: requests.length,
      totalSeedBonus: requests.reduce(
        (sum, r) => sum + (r.seedBonus ?? 0),
        0,
      ),
      sync: store.metadata(),
    });
  });

  app.get("/reseed-history", requireDashboardAuth, (c) => {
    return c.json({ requests: getStore().listHistory() });
  });

  app.post("/reseed-refresh", requireDashboardAuth, (c) => {
    const started = getSynchronizer().start();
    return c.json(
      { started, sync: getStore().metadata() },
      started ? 202 : 200,
    );
  });

  app.get("/reseed-download", requireDashboardAuth, async (c) => {
    const id = c.req.query("id");
    if (!id || !/^\d+$/.test(id)) {
      return c.text("Invalid or missing id", 400);
    }
    return torrentDownloadResponse(id, getDownloader());
  });

  // ------------------------------------------------------------- Torznab API
  app.get("/api", requireApiKey, async (c) => {
    const t = c.req.query("t");

    if (t === "caps") {
      return c.text(buildCapsXml(), 200, XML_CT);
    }

    const SEARCH_TYPES = ["search", "tvsearch", "movie", "music", "book"];
    if (t && SEARCH_TYPES.includes(t)) {
      const ip = getClientIp(c);
      if (!rateLimit(ip)) {
        metrics.rateLimited();
        return c.text(buildErrorXml(429, "Rate limit exceeded"), 429, XML_CT);
      }

      try {
        const { items, proxyBase } = await runSearch(c);
        return c.text(
          buildSearchXml(items, proxyBase, config.proxyApiKey),
          200,
          XML_CT,
        );
      } catch (err) {
        logger.error("api", `Search failed: ${String(err)}`);
        runtimeStatus.record("error", `[/api] Error: ${String(err)}`);
        return c.text(buildErrorXml(100, String(err)), 500, XML_CT);
      }
    }

    return c.text(
      buildErrorXml(202, `Unknown function: ${t ?? ""}`),
      400,
      XML_CT,
    );
  });

  app.get("/download", requireApiKey, async (c) => {
    if (!rateLimit(getClientIp(c))) {
      metrics.rateLimited();
      return c.text("Rate limit exceeded", 429);
    }
    const id = c.req.query("id");
    if (!id) return c.text("Missing id", 400);
    return torrentDownloadResponse(id, getDownloader());
  });

  // ----------------------------------------------------------- UI JSON API
  const ui = new Hono();
  ui.use("*", requireDashboardAuth);

  ui.get("/config", (c) =>
    c.json({
      authRequired: dashboardAuthRequired(),
      version: APP_VERSION,
      baseUrl: getProxyBase(c),
    }),
  );

  ui.get("/status", (c) => c.json(runtimeStatus.snapshot()));
  ui.get("/metrics", (c) => c.json(metrics.snapshot()));

  ui.get("/reseed-data", (c) => {
    const requests = getStore().list();
    return c.json({
      requests,
      count: requests.length,
      totalSeedBonus: requests.reduce(
        (sum, r) => sum + (r.seedBonus ?? 0),
        0,
      ),
      sync: getStore().metadata(),
    });
  });

  ui.get("/reseed-history", (c) =>
    c.json({ requests: getStore().listHistory() }),
  );

  ui.post("/reseed-refresh", (c) => {
    const started = getSynchronizer().start();
    return c.json(
      { started, sync: getStore().metadata() },
      started ? 202 : 200,
    );
  });

  ui.post("/test", async (c) => {
    try {
      await runAllFeatureChecks();
      return c.json({ ok: true, features: runtimeStatus.snapshot().features });
    } catch (err) {
      return c.json({ ok: false, error: String(err) }, 500);
    }
  });

  ui.get("/download", async (c) => {
    const id = c.req.query("id");
    if (!id || !/^\d+$/.test(id)) {
      return c.json({ error: "Invalid or missing id" }, 400);
    }
    return torrentDownloadResponse(id, getDownloader());
  });

  ui.get("/search", async (c) => {
    if (!rateLimit(getClientIp(c))) {
      metrics.rateLimited();
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
    const { items } = await runSearch(c);
    return c.json({
      items: items.map((item) => ({
        ...item,
        // Dashboard-authenticated route — never expose PROXY_API_KEY to the browser.
        downloadUrl: `/api/ui/download?id=${item.id}`,
      })),
    });
  });

  app.route("/api/ui", ui);

  return app;
}

const app = createApp();

logger.info("startup", `${APP_VERSION} starting on port ${config.port}`);

function startPeriodicReseedSync(intervalHours: number): void {
  const ms = Math.max(1, intervalHours) * 60 * 60 * 1000;
  // First sync 30s after startup — lets the session warm up first
  setTimeout(() => reseedSynchronizer.start(), 30_000);
  setInterval(() => reseedSynchronizer.start(), ms);
}

if (process.env.NODE_ENV !== "test") {
  startPeriodicHealthChecks(config.healthCheckIntervalMinutes);
  startPeriodicReseedSync(config.reseedSyncIntervalHours);
  reseedSynchronizer.startPolling(300_000);
}

export {
  app,
  createApp,
  setReseedSynchronizer,
  setReseedStore,
  torrentDownloadResponse,
  reseedStore,
  reseedSynchronizer,
  startPeriodicReseedSync,
};
export default {
  port: config.port,
  fetch: app.fetch,
  // A CloakBrowser login can take 30-60s; keep enough headroom for live logins.
  idleTimeout: 90,
};
