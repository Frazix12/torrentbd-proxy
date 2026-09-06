// src/session.ts
// Manages TorrentBD session cookies. Handles initial login via FlareSolverr
// and TOTP 2FA. Auto-re-logins when the session expires.

import { TOTP } from "otpauth";
import { config } from "./config";
import { flareGet, flarePost } from "./flaresolverr";

interface Session {
  cookies: Array<{ name: string; value: string }>;
  userAgent: string;
}

let session: Session | null = null;
// Prevent concurrent login attempts
let loginInProgress: Promise<void> | null = null;

// Generates the current 6-digit TOTP code from the configured secret.
function generateTotp(): string {
  const totp = new TOTP({ secret: config.tbdTotpSecret, algorithm: "SHA1", digits: 6, period: 30 });
  return totp.generate();
}

// Serializes cookies array to a Cookie header string.
function cookiesToHeader(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

async function doLogin(): Promise<void> {
  console.log("[session] Logging in via FlareSolverr...");

  // Step 1: GET homepage to get cf_clearance + UA
  const homeResult = await flareGet(`${config.tbdBaseUrl}/`);
  const baseCookies = homeResult.cookies;
  const userAgent = homeResult.userAgent;

  // Step 2: POST login credentials + TOTP
  // ponytail: field names (totp_code, takelogin.php) inferred from common tracker patterns
  // — confirm from a login HAR if login fails and adjust here
  const totpCode = generateTotp();
  const loginBody = new URLSearchParams({
    username: config.tbdUsername,
    password: config.tbdPassword,
    totp_code: totpCode,
    returnto: "/",
  }).toString();

  const loginResult = await flarePost(
    `${config.tbdBaseUrl}/takelogin.php`,
    loginBody,
    baseCookies
  );

  // Merge cookies from both calls (login response overrides homepage cookies)
  const merged = new Map<string, string>();
  for (const c of [...baseCookies, ...loginResult.cookies]) {
    merged.set(c.name, c.value);
  }

  const allCookies = [...merged.entries()].map(([name, value]) => ({ name, value }));

  // Verify login succeeded — TBD sets 'user' and 'x_auth' on success
  const hasSessionCookie = allCookies.some(c => c.name === "user" || c.name === "x_auth");
  if (!hasSessionCookie) {
    throw new Error("[session] Login failed — session cookies not found. Check credentials/TOTP.");
  }

  session = { cookies: allCookies, userAgent };
  console.log("[session] Login successful.");
}

export async function getSessionHeaders(): Promise<Record<string, string>> {
  if (!session) {
    if (!loginInProgress) loginInProgress = doLogin().finally(() => { loginInProgress = null; });
    await loginInProgress;
  }
  return {
    "Cookie": cookiesToHeader(session!.cookies),
    "User-Agent": session!.userAgent,
  };
}

export function invalidateSession(): void {
  console.log("[session] Session invalidated — will re-login on next request.");
  session = null;
}
