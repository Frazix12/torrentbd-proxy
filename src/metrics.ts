// src/metrics.ts
// Lightweight in-process counters exposed through /status and /api/ui/metrics.

const startedAt = Date.now();

let totalRequests = 0;
const byStatus = new Map<number, number>();
let cacheHits = 0;
let cacheMisses = 0;
let loginCount = 0;
let challengeCount = 0;
let rateLimitCount = 0;
let searchCount = 0;
let downloadCount = 0;

export const metrics = {
  request(status: number): void {
    totalRequests += 1;
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
  },

  cacheHit(): void {
    cacheHits += 1;
  },

  cacheMiss(): void {
    cacheMisses += 1;
  },

  login(): void {
    loginCount += 1;
  },

  challenge(): void {
    challengeCount += 1;
  },

  rateLimited(): void {
    rateLimitCount += 1;
  },

  search(): void {
    searchCount += 1;
  },

  download(): void {
    downloadCount += 1;
  },

  snapshot() {
    const cacheTotal = cacheHits + cacheMisses;
    return {
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      requests: {
        total: totalRequests,
        byStatus: Object.fromEntries(
          [...byStatus.entries()].sort(([a], [b]) => a - b),
        ),
        searches: searchCount,
        downloads: downloadCount,
      },
      cache: {
        hits: cacheHits,
        misses: cacheMisses,
        hitRate: cacheTotal === 0 ? 0 : cacheHits / cacheTotal,
      },
      sessions: {
        logins: loginCount,
        challenges: challengeCount,
      },
      rateLimits: rateLimitCount,
    };
  },
};

export type MetricsSnapshot = ReturnType<typeof metrics.snapshot>;
