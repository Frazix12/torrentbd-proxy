// src/index.ts
// Hono app entry point. Exposes Torznab API and torrent download proxy for Prowlarr.

import { Hono } from "hono";
import type { Context, Next } from "hono";
import { config } from "./config";
import { torznabCatsToGroups } from "./categories";
import { searchTorrents, browseTorrents, downloadTorrent } from "./tbd-client";
import { parseSearchResults, parseBrowseResults } from "./parser";
import { buildCapsXml, buildSearchXml, buildErrorXml } from "./torznab";
import { cache } from "./cache";
import { runtimeStatus } from "./status";
import { renderDashboard } from "./dashboard";
import { runAllFeatureChecks, startPeriodicHealthChecks } from "./health-check";

const app = new Hono();

const XML_CT = { "Content-Type": "application/xml; charset=utf-8" };

// Health check for Docker
app.get("/health", (c) => c.json({ status: "ok" }));

// Read-only LAN dashboard and status JSON
app.get("/", (c) => c.html(renderDashboard()));
app.get("/status", (c) => c.json(runtimeStatus.snapshot()));

// Trigger on-demand feature tests
app.post("/test", async (c) => {
  try {
    await runAllFeatureChecks();
    return c.json({ ok: true, features: runtimeStatus.snapshot().features });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// Request logging middleware
app.use("*", async (c, next) => {
  console.log(`[req] ${c.req.method} ${c.req.url}`);
  await next();
  const logMsg = `${c.req.method} ${c.req.path} -> ${c.res.status}`;
  console.log(`[res] ${logMsg}`);
  if (c.req.path !== "/status" && c.req.path !== "/health") {
    runtimeStatus.record("info", logMsg);
  }
});

// API key auth middleware
async function requireApiKey(c: Context, next: Next): Promise<Response | void> {
  const key = c.req.query("apikey");
  if (key !== config.proxyApiKey) {
    return c.text("Forbidden: invalid apikey", 403);
  }
  return next();
}

// Main Torznab endpoint
app.get("/api", requireApiKey, async (c) => {
  const t = c.req.query("t");

  if (t === "caps") {
    return c.text(buildCapsXml(), 200, XML_CT);
  }

  const SEARCH_TYPES = ["search", "tvsearch", "movie", "music", "book"];
  if (t && SEARCH_TYPES.includes(t)) {
    const query = c.req.query("q") ?? "";
    const cats = c.req.query("cat");
    // Torznab offset is 0-based per 100 items; TBD page is 1-based
    const offset = parseInt(c.req.query("offset") ?? "0", 10);
    const tbdPage = Math.floor(offset / 100) + 1;

    let host = c.req.header("host");
    if (!host) {
      try {
        host = new URL(c.req.url).host;
      } catch {
        host = `localhost:${config.port}`;
      }
    }
    const proto = c.req.header("x-forwarded-proto") ?? "http";
    const proxyBase = `${proto}://${host}`;

    const cacheKey = `${proxyBase}|${query}|${cats ?? ""}|${tbdPage}`;
    const cached = cache.get(cacheKey);
    if (cached) return c.text(cached, 200, XML_CT);

    try {
      const groups = torznabCatsToGroups(cats);
      const useSearch = query || groups.length > 0;
      const html = useSearch
        ? await searchTorrents(query, groups, tbdPage)
        : await browseTorrents(tbdPage);

      const items = useSearch
        ? parseSearchResults(html)
        : parseBrowseResults(html);
      const xml = buildSearchXml(items, proxyBase, config.proxyApiKey);

      cache.set(cacheKey, xml);
      return c.text(xml, 200, XML_CT);
    } catch (err) {
      console.error("[/api] Error:", err);
      runtimeStatus.record("error", `[/api] Error: ${err}`);
      return c.text(buildErrorXml(100, String(err)), 500, XML_CT);
    }
  }

  return c.text(
    buildErrorXml(202, `Unknown function: ${t ?? ""}`),
    400,
    XML_CT,
  );
});

// Torrent download proxy — streams .torrent binary from TorrentBD to Prowlarr
app.get("/download", requireApiKey, async (c) => {
  const id = c.req.query("id");
  if (!id) return c.text("Missing id", 400);

  try {
    const upstream = await downloadTorrent(id);
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
    console.error("[/download] Error:", err);
    runtimeStatus.record("error", `[/download] Error: ${err}`);
    return c.text(`Download failed: ${err}`, 502);
  }
});

console.log(`[torrentbd-proxy] Starting on port ${config.port}`);

if (process.env.NODE_ENV !== "test") {
  startPeriodicHealthChecks(config.healthCheckIntervalMinutes);
}

export { app };
export default {
  port: config.port,
  fetch: app.fetch,
  // FlareSolverr login takes 30-60s — max Bun allows is 255s
  idleTimeout: 255,
};
