// src/rate-limit.ts
// Sliding window rate limiter for the Torznab /api endpoint.
// In-memory per-IP — resets on container restart, which is fine for this use case.
// ponytail: global in-memory map; add Redis/persistent store if multi-instance or restart persistence matters

const windows = new Map<string, number[]>();

/**
 * Returns true if the request is allowed, false if rate limit exceeded.
 * Defaults: 30 requests per 60 seconds per IP.
 */
export function rateLimit(
  ip: string,
  maxReqs = 30,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const hits = (windows.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= maxReqs) return false;
  hits.push(now);
  windows.set(ip, hits);
  return true;
}
