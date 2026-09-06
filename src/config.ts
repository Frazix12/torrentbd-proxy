// src/config.ts
// Loads and validates all required environment variables at startup.
// Throws immediately if any required var is missing.

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  tbdUsername: required("TBD_USERNAME"),
  tbdPassword: required("TBD_PASSWORD"),
  tbdTotpSecret: required("TBD_TOTP_SECRET"),
  tbdBaseUrl: process.env.TBD_BASE_URL ?? "https://www.torrentbd.net",
  flareSolverrUrl: process.env.FLARESOLVERR_URL ?? "http://flaresolverr:8191",
  proxyApiKey: required("PROXY_API_KEY"),
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? "300"),
  port: Number(process.env.PORT ?? "5000"),
};
