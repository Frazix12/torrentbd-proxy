// src/config.ts
// Loads and validates all required environment variables at startup.
// Throws immediately if any required var is missing.

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const DEFAULT_PORT = 6950;

export const config = {
  tbdUsername: required("TBD_USERNAME"),
  tbdPassword: required("TBD_PASSWORD"),
  tbdTotpSecret: required("TBD_TOTP_SECRET"),
  tbdBaseUrl: process.env.TBD_BASE_URL ?? "https://www.torrentbd.net",
  proxyApiKey: required("PROXY_API_KEY"),
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? "300"),
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  cloakProfileDir: process.env.CLOAK_PROFILE_DIR ?? "/data/cloak-profile",
  healthCheckIntervalMinutes: Number(
    process.env.HEALTH_CHECK_INTERVAL_MINUTES ?? "30",
  ),
};
