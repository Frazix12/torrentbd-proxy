// src/session.ts
// Manages TorrentBD session cookies using CloakBrowser for stealth authentication.
// Handles Cloudflare bypass, reCAPTCHA v3, and TOTP 2FA.

import { launch } from "cloakbrowser";
import { TOTP } from "otpauth";
import { config } from "./config";

interface Session {
  cookies: Array<{ name: string; value: string }>;
  userAgent: string;
}

let session: Session | null = null;
let loginInProgress: Promise<void> | null = null;

function generateTotp(): string {
  const totp = new TOTP({
    secret: config.tbdTotpSecret,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  return totp.generate();
}

function cookiesToHeader(
  cookies: Array<{ name: string; value: string }>,
): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function doLogin(): Promise<void> {
  console.log("[session] Logging in via CloakBrowser...");
  const browser = await launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const loginUrl = `${config.tbdBaseUrl}/account-login.php?returnto=%2F`;
    await page.goto(loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    // Wait for Cloudflare challenge resolution and form readiness
    await page.waitForSelector("#username", { timeout: 60000 });
    // Ensure Google reCAPTCHA v3 script is loaded and ready
    await page.waitForFunction(
      () => {
        // SAFETY: grecaptcha is dynamically injected on window by Google reCAPTCHA script
        const win = window as unknown as {
          grecaptcha?: { execute?: () => void };
        };
        return typeof win.grecaptcha?.execute === "function";
      },
      { timeout: 30000 },
    );

    // Phase 1: fill credentials and submit
    console.log("[session] Submitting credentials (Phase 1)...");
    await page.fill("#username", config.tbdUsername);
    await page.fill("#password", config.tbdPassword);
    await page.click("#submit-btn");

    // Wait for Phase 1 AJAX response (unhidden #otp-container or error message)
    await page.waitForFunction(
      () => {
        const err = document.getElementById("error-message")?.innerText?.trim();
        if (err) return true;
        const otpContainer = document.getElementById("otp-container");
        return otpContainer && !otpContainer.classList.contains("hidden");
      },
      { timeout: 30000 },
    );

    const errorText = await page.textContent("#error-message");
    if (errorText?.trim()) {
      throw new Error(`[session] Phase 1 failed: ${errorText.trim()}`);
    }

    // Phase 2: submit TOTP
    console.log("[session] Submitting TOTP (Phase 2)...");
    const otpCode = generateTotp();
    await page.fill("#otp", otpCode);
    await page.click("#submit-btn");

    // Wait for redirect to home or error message
    await page
      .waitForFunction(
        () => {
          return (
            window.location.pathname === "/" ||
            !!document.getElementById("error-message")?.innerText?.trim()
          );
        },
        { timeout: 20000 },
      )
      .catch(() => {});

    if (page.url().includes("account-login.php")) {
      const phase2Error = await page
        .locator("#error-message")
        .textContent({ timeout: 1000 })
        .catch(() => null);
      if (phase2Error?.trim()) {
        throw new Error(`[session] Phase 2 failed: ${phase2Error.trim()}`);
      }
    }

    const cookies = await context.cookies();
    const userAgent = await page.evaluate(() => navigator.userAgent);

    const hasSessionCookie = cookies.some(
      (c) => c.name === "user" || c.name === "x_auth",
    );
    if (!hasSessionCookie) {
      throw new Error(
        "[session] Login failed — session cookies not found after Phase 2.",
      );
    }

    session = { cookies, userAgent };
    console.log("[session] Login successful.");
  } finally {
    await browser.close();
  }
}

export async function getSessionHeaders(): Promise<Record<string, string>> {
  if (!session) {
    if (!loginInProgress)
      loginInProgress = doLogin().finally(() => {
        loginInProgress = null;
      });
    await loginInProgress;
  }
  if (!session) {
    throw new Error("[session] Failed to establish session");
  }
  return {
    Cookie: cookiesToHeader(session.cookies),
    "User-Agent": session.userAgent,
  };
}

export function invalidateSession(): void {
  console.log("[session] Session invalidated — will re-login on next request.");
  session = null;
}
