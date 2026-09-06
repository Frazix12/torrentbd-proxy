// src/session.ts
// Manages TorrentBD session cookies.
//
// Login flow (confirmed from HAR analysis):
//   Phase 1: POST /ajtakelogin.php with credentials → {"success":true,"mfa":true}
//   Phase 2: POST /ajtakelogin.php with TOTP code (otp field) → session cookies set
//
// Both phases go through FlareSolverr to:
//   - Handle Cloudflare challenge (cf_clearance)
//   - Execute page JavaScript that generates recaptcha_token and uaf tokens
//   - Maintain a persistent browser session across requests
//
// After login, direct HTTP requests use the stored cookies + exact User-Agent.

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

function generateTotp(): string {
  const totp = new TOTP({ secret: config.tbdTotpSecret, algorithm: "SHA1", digits: 6, period: 30 });
  return totp.generate();
}

function cookiesToHeader(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

function mergeCookies(
  base: Array<{ name: string; value: string }>,
  override: Array<{ name: string; value: string }>
): Array<{ name: string; value: string }> {
  const merged = new Map<string, string>();
  for (const c of [...base, ...override]) merged.set(c.name, c.value);
  return [...merged.entries()].map(([name, value]) => ({ name, value }));
}

async function doLogin(): Promise<void> {
  console.log("[session] Starting login via FlareSolverr...");

  // Step 1: GET login page through FlareSolverr.
  // This gets us cf_clearance, the stored User-Agent, and the page JS runs
  // (loading reCAPTCHA v3 and the uaf fingerprint script).
  const loginPageUrl = `${config.tbdBaseUrl}/account-login.php?returnto=%2F`;
  const pageResult = await flareGet(loginPageUrl);
  let cookies = pageResult.cookies;
  const userAgent = pageResult.userAgent;

  // Step 2: Phase 1 login — credentials only, otp empty, login_phase=1.
  // recaptcha_token and uaf are required by the server but FlareSolverr's
  // browser session has already executed the page JS that sets them up.
  // We send empty strings for these; the server's reCAPTCHA v3 is invisible/score-based
  // and may accept submissions from an established CF-cleared browser session.
  // ponytail: if recaptcha_token rejection occurs, will need FlareSolverr executeScript
  // to extract the token from the page before submitting — upgrade path documented below.
  const phase1Body = new URLSearchParams({
    isAjax: "1",
    auth_login: "",
    recaptcha_token: "",
    return_to: "/",
    username: config.tbdUsername,
    password: config.tbdPassword,
    otp: "",
    login_phase: "1",
    _remember: "yes",
    extra: "",
    uaf: "",
  }).toString();

  console.log("[session] Phase 1: submitting credentials...");
  const phase1Result = await flarePost(
    `${config.tbdBaseUrl}/ajtakelogin.php`,
    phase1Body,
    cookies
  );

  cookies = mergeCookies(cookies, phase1Result.cookies);

  // Parse phase 1 response
  let phase1Json: { success?: boolean; mfa?: boolean; message?: string } = {};
  try {
    phase1Json = JSON.parse(phase1Result.responseBody);
  } catch {
    // Non-JSON response — may be a redirect to login (session issue)
    if (phase1Result.responseBody.includes("account-login.php")) {
      throw new Error("[session] Phase 1 failed — redirected to login. Check credentials or CF session.");
    }
  }

  if (!phase1Json.success) {
    throw new Error(`[session] Phase 1 failed: ${phase1Json.message ?? phase1Result.responseBody.substring(0, 200)}`);
  }

  // Step 3: Phase 2 — submit TOTP code.
  // Generate the 6-digit code right before submission to avoid clock drift.
  const totpCode = generateTotp();
  console.log("[session] Phase 2: submitting TOTP code...");

  const phase2Body = new URLSearchParams({
    isAjax: "1",
    auth_login: "",
    recaptcha_token: "",
    return_to: "/",
    username: config.tbdUsername,
    password: config.tbdPassword,
    otp: totpCode,
    login_phase: "2",
    _remember: "yes",
    extra: "",
    uaf: "",
  }).toString();

  const phase2Result = await flarePost(
    `${config.tbdBaseUrl}/ajtakelogin.php`,
    phase2Body,
    cookies
  );

  cookies = mergeCookies(cookies, phase2Result.cookies);

  // Verify session cookies are present after phase 2
  const hasSession = cookies.some(c => c.name === "user" || c.name === "x_auth");
  if (!hasSession) {
    const resp = phase2Result.responseBody.substring(0, 300);
    throw new Error(`[session] Login failed after phase 2 — no session cookies. Response: ${resp}`);
  }

  session = { cookies, userAgent };
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
