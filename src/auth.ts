// src/auth.ts
// Authentication helpers for the Torznab API and the optional dashboard key.

import { timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { config } from "./config";

/** Constant-time string comparison (avoids trivial timing leaks). */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Read the Torznab API key from a header first, then from legacy query params. */
export function getApiKey(c: Context): string | undefined {
  return (
    c.req.header("x-api-key") ??
    c.req.header("api-key") ??
    c.req.query("apikey") ??
    c.req.query("api_key") ??
    parseBearer(c.req.header("authorization"))
  );
}

function parseBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

export async function requireApiKey(
  c: Context,
  next: Next,
): Promise<Response | void> {
  const provided = getApiKey(c);
  if (!provided || !safeEqual(provided, config.proxyApiKey)) {
    return c.text("Forbidden: invalid apikey", 403);
  }
  return next();
}

export function dashboardAuthRequired(): boolean {
  return config.dashboardApiKey.length > 0;
}

function getDashboardKey(c: Context): string | undefined {
  const headerKey = c.req.header("x-dashboard-key");
  if (headerKey) return headerKey;
  const bearer = parseBearer(c.req.header("authorization"));
  if (bearer) return bearer;
  return parseBasicPassword(c.req.header("authorization"));
}

function parseBasicPassword(header: string | undefined): string | undefined {
  if (!header || !/^Basic\s+/i.test(header)) return undefined;
  try {
    const decoded = atob(header.replace(/^Basic\s+/i, ""));
    const separator = decoded.indexOf(":");
    return separator === -1 ? undefined : decoded.slice(separator + 1);
  } catch {
    return undefined;
  }
}

/** Guards dashboard/UI/admin routes. No-op when DASHBOARD_API_KEY is unset. */
export async function requireDashboardAuth(
  c: Context,
  next: Next,
): Promise<Response | void> {
  if (!dashboardAuthRequired()) return next();

  const provided = getDashboardKey(c);
  if (!provided || !safeEqual(provided, config.dashboardApiKey)) {
    return c.json(
      { error: "Unauthorized", message: "Invalid or missing dashboard key" },
      401,
      { "WWW-Authenticate": 'Basic realm="TorrentBD Proxy"' },
    );
  }
  return next();
}
