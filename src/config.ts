// src/config.ts
// Loads and validates all required environment variables at startup.
// Throws immediately if any required var is missing.

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function publicBaseUrl(raw: string | undefined): string {
  if (!raw || raw.trim() === "") return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
    return url.origin;
  } catch {
    throw new Error("PUBLIC_BASE_URL must be an absolute http(s) URL");
  }
}

export const DEFAULT_PORT = 6950;

const cloakProfileDir = process.env.CLOAK_PROFILE_DIR ?? "/data/cloak-profile";

export const config = {
  tbdUsername: required("TBD_USERNAME"),
  tbdPassword: required("TBD_PASSWORD"),
  tbdTotpSecret: required("TBD_TOTP_SECRET"),
  tbdBaseUrl: process.env.TBD_BASE_URL ?? "https://www.torrentbd.net",
  proxyApiKey: required("PROXY_API_KEY"),
  cacheTtlSeconds: numberEnv("CACHE_TTL_SECONDS", 300),
  port: numberEnv("PORT", DEFAULT_PORT),
  cloakProfileDir,
  healthCheckIntervalMinutes: numberEnv("HEALTH_CHECK_INTERVAL_MINUTES", 30),
  reseedSyncIntervalHours: numberEnv("RESEED_SYNC_INTERVAL_HOURS", 6),
  reseedDbPath:
    process.env.RESEED_DB_PATH ??
    (process.env.NODE_ENV === "test"
      ? ":memory:"
      : `${cloakProfileDir}/reseed.sqlite`),
  cacheDbPath:
    process.env.CACHE_DB_PATH ??
    (process.env.NODE_ENV === "test"
      ? ":memory:"
      : `${cloakProfileDir}/cache.sqlite`),
  notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL ?? "",

  // Optional dashboard access key. Empty = LAN access stays open (legacy behaviour).
  dashboardApiKey: process.env.DASHBOARD_API_KEY ?? "",
  // Canonical external URL used in Torznab enclosure links. Empty = derive from request.
  publicBaseUrl: publicBaseUrl(process.env.PUBLIC_BASE_URL),
  // Only trust X-Forwarded-* headers when explicitly enabled (reverse-proxy setups).
  trustProxy: process.env.TRUST_PROXY === "true",
  logLevel: (process.env.LOG_LEVEL ?? "info").toLowerCase(),
  rateLimitMax: numberEnv("RATE_LIMIT_MAX", 30),
  rateLimitWindowMs: numberEnv("RATE_LIMIT_WINDOW_MS", 60_000),
};
