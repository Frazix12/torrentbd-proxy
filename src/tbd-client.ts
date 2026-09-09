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
// Retries once on session expiry.
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
  });

  const html = await res.text();

  if (
    (isLoginRedirect(html, res.url) ||
      isCloudflareChallenge(html, res.status)) &&
    attempt === 0
  ) {
    invalidateSession();
    return tbdPost(path, body, 1);
  }

  if (isCloudflareChallenge(html, res.status)) {
    throw new Error(
      `Cloudflare challenge blocked ${path} (HTTP ${res.status})`,
    );
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
  });

  // Re-login and retry once if challenged or redirected to login
  if ((!res.ok || res.url.includes("account-login.php")) && attempt === 0) {
    invalidateSession();
    return downloadTorrent(id, 1);
  }

  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }

  return res;
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
