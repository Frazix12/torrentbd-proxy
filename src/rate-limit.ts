// src/rate-limit.ts
// Sliding-window rate limiter with bounded memory and trusted-proxy IP resolution.

import type { Context } from "hono";
import { config } from "./config";

const windows = new Map<string, number[]>();
let callsSinceCleanup = 0;

/**
 * Returns true if the request is allowed, false if rate limit exceeded.
 * Defaults: 30 requests per 60 seconds per IP.
 */
export function rateLimit(
  ip: string,
  maxReqs = config.rateLimitMax,
  windowMs = config.rateLimitWindowMs,
): boolean {
  const now = Date.now();
  let hits = windows.get(ip);
  if (!hits) {
    hits = [];
    windows.set(ip, hits);
  }

  // Drop timestamps outside the current window.
  let writeIndex = 0;
  for (let i = 0; i < hits.length; i++) {
    if (now - hits[i]! < windowMs) hits[writeIndex++] = hits[i]!;
  }
  hits.length = writeIndex;

  if (hits.length >= maxReqs) {
    maybeCleanup(now, windowMs);
    return false;
  }

  hits.push(now);
  maybeCleanup(now, windowMs);
  return true;
}

/** Free buckets that have not been used for a full window. */
function maybeCleanup(now: number, windowMs: number): void {
  callsSinceCleanup += 1;
  if (callsSinceCleanup < 200) return;
  callsSinceCleanup = 0;
  for (const [ip, hits] of windows) {
    if (hits.length === 0 || now - hits[hits.length - 1]! > windowMs) {
      windows.delete(ip);
    }
  }
}

/**
 * Resolve the caller IP. X-Forwarded-For is only honoured when TRUST_PROXY=true;
 * otherwise we use Bun's socket address (unspoofable by the client).
 */
export function getClientIp(c: Context): string {
  if (config.trustProxy) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    const realIp = c.req.header("x-real-ip")?.trim();
    if (realIp) return realIp;
  }

  const env = c.env as
    | { requestIP?: (req: Request) => { address?: string } | null }
    | undefined;
  const socketIp = env?.requestIP?.(c.req.raw)?.address;
  return socketIp ?? "local";
}

export function rateLimitSize(): number {
  return windows.size;
}
