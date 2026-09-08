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

  if (isLoginRedirect(html, res.url) && attempt === 0) {
    invalidateSession();
    return tbdPost(path, body, 1);
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
    return fetch(`${BASE}/download.php?id=${id}`, {
      headers: headers2,
      redirect: "follow",
    });
  }

  return res;
}

export async function fetchReseedPage(
  url = `${BASE}/reseed-requests.php`,
  attempt = 0,
): Promise<string> {
  const target = new URL(url, BASE);
  if (
    target.origin !== new URL(BASE).origin ||
    target.pathname !== "/reseed-requests.php"
  ) {
    throw new Error("Invalid reseed page URL");
  }

  const headers = await getSessionHeaders();
  const response = await fetch(target.href, {
    method: "GET",
    headers: { ...headers, Referer: `${BASE}/reseed-requests.php` },
    redirect: "follow",
  });
  const html = await response.text();

  if (isLoginRedirect(html, response.url) && attempt === 0) {
    invalidateSession();
    return fetchReseedPage(target.href, 1);
  }
  if (!response.ok || isLoginRedirect(html, response.url)) {
    throw new Error(`Reseed page failed: HTTP ${response.status}`);
  }
  return html;
}
