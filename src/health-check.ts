// src/health-check.ts
// Runs automated feature tests periodically and updates dashboard status.

import { runtimeStatus } from "./status";
import { getSessionHeaders } from "./session";
import {
  searchTorrents,
  browseTorrents,
  checkDownloadConnectivity,
} from "./tbd-client";
import { parseSearchResults, parseBrowseResults } from "./parser";
import { buildCapsXml } from "./torznab";
import { notify } from "./notify";

export async function runAllFeatureChecks(): Promise<void> {
  console.log("[health-check] Starting automated feature verification...");

  // 1. Session & Cloudflare Clearance
  const sessionStart = Date.now();
  try {
    const headers = await getSessionHeaders();
    if (
      !headers.Cookie?.includes("user=") &&
      !headers.Cookie?.includes("x_auth=")
    ) {
      throw new Error("Missing auth cookies in session");
    }
    runtimeStatus.setFeatureStatus("session", {
      status: "operational",
      latencyMs: Date.now() - sessionStart,
      lastCheckedAt: new Date().toISOString(),
      details: "Authenticated & Cloudflare clearance active",
    });
  } catch (err) {
    runtimeStatus.setFeatureStatus("session", {
      status: "failing",
      latencyMs: Date.now() - sessionStart,
      lastCheckedAt: new Date().toISOString(),
      details: String(err),
    });
    notify(`[TorrentBD] Feature "session" is failing: ${err}`);
  }

  // 2. Torznab Capabilities
  const capsStart = Date.now();
  try {
    const xml = buildCapsXml();
    if (!xml.includes("<caps>") || !xml.includes("<searching>")) {
      throw new Error("Invalid capabilities XML format");
    }
    runtimeStatus.setFeatureStatus("caps", {
      status: "operational",
      latencyMs: Date.now() - capsStart,
      lastCheckedAt: new Date().toISOString(),
      details: "Caps XML generated successfully",
    });
  } catch (err) {
    runtimeStatus.setFeatureStatus("caps", {
      status: "failing",
      latencyMs: Date.now() - capsStart,
      lastCheckedAt: new Date().toISOString(),
      details: String(err),
    });
  }

  // 3. Browse Feed
  let sampleTorrentId: string | null = null;
  const browseStart = Date.now();
  try {
    const html = await browseTorrents(1);
    const items = parseBrowseResults(html);
    if (items.length === 0) {
      throw new Error("0 items found in browse feed");
    }
    sampleTorrentId = items[0].id;
    runtimeStatus.setFeatureStatus("browse", {
      status: "operational",
      latencyMs: Date.now() - browseStart,
      lastCheckedAt: new Date().toISOString(),
      details: `${items.length} items parsed from page 1`,
    });
  } catch (err) {
    runtimeStatus.setFeatureStatus("browse", {
      status: "failing",
      latencyMs: Date.now() - browseStart,
      lastCheckedAt: new Date().toISOString(),
      details: String(err),
    });
    notify(`[TorrentBD] Feature "browse" is failing: ${err}`);
  }

  // 4. Torrent Search
  const searchStart = Date.now();
  try {
    const html = await searchTorrents("Spider", []);
    const items = parseSearchResults(html);
    if (items.length === 0) {
      throw new Error("0 items found for search query 'Spider'");
    }
    if (!sampleTorrentId) sampleTorrentId = items[0].id;
    runtimeStatus.setFeatureStatus("search", {
      status: "operational",
      latencyMs: Date.now() - searchStart,
      lastCheckedAt: new Date().toISOString(),
      details: `${items.length} items found for 'Spider'`,
    });
  } catch (err) {
    runtimeStatus.setFeatureStatus("search", {
      status: "failing",
      latencyMs: Date.now() - searchStart,
      lastCheckedAt: new Date().toISOString(),
      details: String(err),
    });
    notify(`[TorrentBD] Feature "search" is failing: ${err}`);
  }

  // 5. Download Connectivity (Lightweight HEAD check)
  const dlStart = Date.now();
  try {
    if (!sampleTorrentId) {
      throw new Error("No torrent ID available from browse/search to test");
    }
    const check = await checkDownloadConnectivity(sampleTorrentId);
    if (!check.ok) {
      throw new Error(check.error || `Download returned HTTP ${check.status}`);
    }
    runtimeStatus.setFeatureStatus("download", {
      status: "operational",
      latencyMs: check.latencyMs || Date.now() - dlStart,
      lastCheckedAt: new Date().toISOString(),
      details: "HEAD check passed (HTTP 200, .torrent ready)",
    });
  } catch (err) {
    runtimeStatus.setFeatureStatus("download", {
      status: "failing",
      latencyMs: Date.now() - dlStart,
      lastCheckedAt: new Date().toISOString(),
      details: String(err),
    });
    notify(`[TorrentBD] Feature "download" is failing: ${err}`);
  }

  console.log("[health-check] Automated feature verification complete.");
}

let checkIntervalTimer: ReturnType<typeof setInterval> | null = null;

export function startPeriodicHealthChecks(intervalMinutes = 30): void {
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

  // Run first check shortly after startup
  setTimeout(() => {
    runAllFeatureChecks().catch((err) => {
      console.error("[health-check] Initial check error:", err);
    });
  }, 4000);

  if (checkIntervalTimer) {
    clearInterval(checkIntervalTimer);
  }

  checkIntervalTimer = setInterval(() => {
    runAllFeatureChecks().catch((err) => {
      console.error("[health-check] Scheduled check error:", err);
    });
  }, intervalMs);
}
