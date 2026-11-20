// src/tbd-client.ts
// Makes authenticated HTTP requests to TorrentBD's AJAX endpoints.
// Detects session expiry (login redirect) and triggers re-login automatically.
// Transient Cloudflare challenges are retried with the SAME session first —
// invalidating immediately on every 403 caused a re-login storm.

import { config } from "./config";
import { getSessionHeaders, invalidateSession } from "./session";
import { logger } from "./logger";
import { metrics } from "./metrics";

const BASE = config.tbdBaseUrl;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function backoff(attempt: number): Promise<void> {
  await sleep(350 * attempt + Math.floor(Math.random() * 250));
}

// Detects if a response URL or HTML body indicates a login redirect.
function isLoginRedirect(html: string, finalUrl?: string): boolean {
  return (
    (finalUrl?.includes("account-login.php") ?? false) ||
    html.includes("account-login.php") ||
    html.includes("takelogin.php")
  );
}

// Detects if a response indicates Cloudflare bot challenge or block.
function isCloudflareChallenge(html: string, status?: number): boolean {
  return (
    status === 403 ||
    status === 503 ||
    html.includes("Just a moment...") ||
    html.includes("challenges.cloudflare.com")
  );
}

// Makes an authenticated POST to a TBD AJAX endpoint.
// Retry policy: transient challenge -> same session -> invalidate -> give up.
async function tbdPost(
  path: string,
  body: URLSearchParams,
  attempt = 0,
): Promise<string> {
  const headers = await getSessionHeaders();
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${BASE}/`,
      Origin: BASE,
    },
    body: body.toString(),
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });

  const html = await res.text();
  const challenged = isCloudflareChallenge(html, res.status);
  const loginRedirect = isLoginRedirect(html, res.url);

  if (loginRedirect && attempt === 0) {
    logger.info("tbd-client", `Session expired on ${path}; re-authenticating`);
    invalidateSession();
    return tbdPost(path, body, 1);
  }

  if (challenged && attempt < 2) {
    metrics.challenge();
    if (attempt === 1) invalidateSession();
    logger.warn(
      "tbd-client",
      `Cloudflare challenge on ${path} (HTTP ${res.status}), retry ${
        attempt + 1
      }/2`,
    );
    await backoff(attempt + 1);
    return tbdPost(path, body, attempt + 1);
  }

  if (challenged) {
    throw new Error(
      `Cloudflare challenge blocked ${path} (HTTP ${res.status})`,
    );
  }
  if (loginRedirect) {
    throw new Error(`Session expired on ${path} after re-authentication`);
  }

  return html;
}

export async function searchTorrents(
  query: string,
  groups: string[],
  page = 1,
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

export async function downloadTorrent(
  id: string,
  attempt = 0,
): Promise<Response> {
  const headers = await getSessionHeaders();
  const res = await fetch(`${BASE}/download.php?id=${id}`, {
    headers: {
      ...headers,
      Referer: `${BASE}/`,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(60000),
  });

  const challenged = res.status === 403 || res.status === 503;
  const loginRedirect = res.url.includes("account-login.php");

  if (loginRedirect && attempt === 0) {
    invalidateSession();
    return downloadTorrent(id, 1);
  }

  if (challenged && attempt < 2) {
    metrics.challenge();
    if (attempt === 1) invalidateSession();
    logger.warn(
      "tbd-client",
      `Cloudflare challenge on download ${id} (HTTP ${res.status}), retry ${
        attempt + 1
      }/2`,
    );
    await backoff(attempt + 1);
    return downloadTorrent(id, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }

  return res;
}

export async function fetchReseedPage(
  url = `${BASE}/reseed-requests.php`,
  attempt = 0,
): Promise<string> {
  let target: URL;
  try {
    target = new URL(url, BASE);
    const allowedOrigin = new URL(BASE).origin;
    if (
      target.origin !== allowedOrigin ||
      target.pathname !== "/reseed-requests.php"
    ) {
      throw new Error("Unexpected origin or path");
    }
  } catch {
    throw new Error("Invalid reseed page URL");
  }

  const headers = await getSessionHeaders();
  // pi-lens-ignore: ts-ssrf -- target is allowlisted to TorrentBD origin and exact reseed path above.
  const response = await fetch(target.href, {
    method: "GET",
    headers: { ...headers, Referer: `${BASE}/reseed-requests.php` },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  const html = await response.text();
  const challenged = isCloudflareChallenge(html, response.status);
  const loginRedirect = isLoginRedirect(html, response.url);

  if (loginRedirect && attempt === 0) {
    invalidateSession();
    return fetchReseedPage(target.href, 1);
  }

  if (challenged && attempt < 2) {
    metrics.challenge();
    if (attempt === 1) invalidateSession();
    logger.warn(
      "tbd-client",
      `Cloudflare challenge on reseed page (HTTP ${response.status}), retry ${
        attempt + 1
      }/2`,
    );
    await backoff(attempt + 1);
    return fetchReseedPage(target.href, attempt + 1);
  }

  if (challenged) {
    throw new Error(
      `Cloudflare challenge blocked reseed page (HTTP ${response.status})`,
    );
  }
  if (!response.ok || loginRedirect) {
    throw new Error(`Reseed page failed: HTTP ${response.status}`);
  }
  return html;
}

export async function checkDownloadConnectivity(
  id: string,
): Promise<{ ok: boolean; status: number; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const headers = await getSessionHeaders();
    const res = await fetch(`${BASE}/download.php?id=${id}`, {
      method: "HEAD",
      headers: {
        ...headers,
        Referer: `${BASE}/`,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    const latencyMs = Date.now() - start;
    if (res.status === 200) {
      return { ok: true, status: 200, latencyMs };
    }
    return {
      ok: false,
      status: res.status,
      latencyMs,
      error: `Download returned HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      error: String(err),
    };
  }
}
