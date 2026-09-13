// src/session.ts
// Manages TorrentBD session cookies using CloakBrowser persistent context for stealth authentication.
// Handles Cloudflare bypass, reCAPTCHA v3, and TOTP 2FA.

import { launchPersistentContext } from "cloakbrowser";
import type { Frame, Page } from "playwright-core";
import { TOTP } from "otpauth";
import { config } from "./config";
import { runtimeStatus } from "./status";
import { notify } from "./notify";

interface Session {
  cookies: Array<{ name: string; value: string; expires?: number }>;
  userAgent: string;
}

const CLOAK_FINGERPRINT = "12345";

let session: Session | null = null;
let forceLogin = false;
let sessionSyncInProgress: Promise<void> | null = null;

export function hasSessionCookie(
  cookies: Array<{ name: string; value: string }>,
): boolean {
  return cookies.some(
    (c) => (c.name === "user" || c.name === "x_auth") && Boolean(c.value),
  );
}

export function getSessionCookieNames(
  cookies: Array<{ name: string; value?: string }>,
): string[] {
  return cookies
    .filter((cookie) => cookie.name === "user" || cookie.name === "x_auth")
    .map((cookie) => cookie.name);
}

export function shouldReuseStoredCookies(
  cookies: Array<{ name: string; value: string }>,
  isForceLogin = false,
): boolean {
  if (isForceLogin) return false;
  return hasSessionCookie(cookies);
}

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

async function solveTurnstileUntilResolved(
  page: Page,
  isTargetResolved: () => Promise<boolean>,
  maxWaitMs = 45000,
): Promise<boolean> {
  const start = Date.now();
  let lastClickTime = 0;
  while (Date.now() - start < maxWaitMs) {
    if (await isTargetResolved()) return true;

    const frame = page
      .frames()
      .find((f: Frame) => f.url().includes("challenges.cloudflare.com"));
    if (frame) {
      try {
        const frameEl = await frame.frameElement();
        const box = await frameEl.boundingBox();
        const now = Date.now();
        if (
          box &&
          box.width > 0 &&
          box.height > 0 &&
          now - lastClickTime > 1500
        ) {
          lastClickTime = now;
          console.log(
            "[session] Cloudflare Turnstile detected, clicking verification box...",
          );
          runtimeStatus.record(
            "info",
            "Cloudflare Turnstile detected, clicking verification box...",
          );
          await page.mouse.click(box.x + 30, box.y + box.height / 2);
        }
      } catch {
        // Frame may be re-rendering or navigating
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return isTargetResolved();
}

async function syncSession(): Promise<void> {
  runtimeStatus.setSessionState("checking");
  runtimeStatus.record("info", "Opening CloakBrowser persistent profile...");
  const isHeadless = process.env.HEADLESS === "true" || !process.env.DISPLAY;
  const context = await launchPersistentContext({
    userDataDir: config.cloakProfileDir,
    headless: isHeadless,
    args: [
      "--no-sandbox",
      `--fingerprint=${CLOAK_FINGERPRINT}`,
      "--fingerprint-platform=windows",
    ],
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    const userAgent = await page.evaluate(() => navigator.userAgent);

    const storedCookies = await context.cookies([config.tbdBaseUrl]);
    if (!forceLogin && shouldReuseStoredCookies(storedCookies, forceLogin)) {
      runtimeStatus.record(
        "info",
        "Verifying stored session cookies from persistent profile...",
      );
      try {
        await page.goto(`${config.tbdBaseUrl}/`, {
          waitUntil: "domcontentloaded",
          timeout: 25000,
        });
        await solveTurnstileUntilResolved(
          page,
          async () => {
            const title = await page.title();
            return !title.includes("Just a moment");
          },
          15000,
        );
        const currentUrl = page.url();
        const title = await page.title();
        const isValid =
          !currentUrl.includes("account-login.php") &&
          !title.includes("Just a moment");

        if (isValid) {
          runtimeStatus.record(
            "info",
            "Stored session cookies verified successfully.",
          );
          const freshCookies = await context.cookies();
          session = { cookies: freshCookies, userAgent };
          runtimeStatus.setSessionState("authenticated");
          return;
        }
        runtimeStatus.record(
          "warn",
          "Stored session expired or challenged; re-authenticating...",
        );
      } catch (err) {
        runtimeStatus.record(
          "warn",
          `Stored session check failed (${err}); re-authenticating...`,
        );
      }
    }

    runtimeStatus.setSessionState("authenticating");
    runtimeStatus.record(
      "info",
      forceLogin
        ? "Session expired: clearing cookies and re-authenticating..."
        : "No stored session: performing initial login...",
    );
    for (const name of getSessionCookieNames(storedCookies)) {
      await context.clearCookies({ name });
    }

    const loginUrl = `${config.tbdBaseUrl}/account-login.php?returnto=%2F`;
    await page.goto(loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    // Handle Cloudflare Turnstile until #username is ready
    const usernameVisible = await solveTurnstileUntilResolved(
      page,
      async () => {
        try {
          const el = await page.$("#username");
          if (!el) return false;
          return await el.isVisible();
        } catch {
          // Execution context destroyed mid-navigation — treat as not resolved yet
          return false;
        }
      },
      45000,
    );
    if (!usernameVisible) {
      throw new Error(
        "[session] Login form (#username) did not appear after 45s — Turnstile may be blocking",
      );
    }
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
    runtimeStatus.record("info", "Submitting credentials (Phase 1)...");
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
    runtimeStatus.record("info", "Submitting TOTP (Phase 2)...");
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
    if (!hasSessionCookie(cookies)) {
      throw new Error(
        "[session] Login failed — session cookies not found after Phase 2.",
      );
    }

    session = { cookies, userAgent };
    forceLogin = false;
    runtimeStatus.markLogin();
    console.log("[session] Login successful.");
    runtimeStatus.record("info", "Session established and profile persisted.");
  } catch (err) {
    runtimeStatus.setSessionState("error");
    runtimeStatus.record("error", `[session] Error: ${err}`);
    throw err;
  } finally {
    try {
      await Promise.race([
        context.close(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("context.close() timeout")), 5000),
        ),
      ]);
    } catch (closeErr) {
      console.warn("[session] Failed to close context cleanly:", closeErr);
    }
  }
}

export async function getSessionHeaders(): Promise<Record<string, string>> {
  // Proactive expiry: re-login if any auth cookie expires within 5 minutes
  if (session) {
    const nowSec = Date.now() / 1000;
    const expiringSoon = session.cookies.some(
      (c) =>
        (c.name === "user" || c.name === "x_auth") &&
        c.expires !== undefined &&
        c.expires > 0 &&
        c.expires - nowSec < 300,
    );
    if (expiringSoon) {
      console.log("[session] Auth cookie expiring soon — proactively re-authenticating.");
      runtimeStatus.record("warn", "Auth cookie expiring soon — proactively re-authenticating.");
      invalidateSession();
    }
  }

  if (!session) {
    if (!sessionSyncInProgress) {
      sessionSyncInProgress = syncSession().finally(() => {
        sessionSyncInProgress = null;
      });
    }
    await sessionSyncInProgress;
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
  runtimeStatus.record(
    "warn",
    "Session invalidated — will re-login on next request.",
  );
  notify("[TorrentBD] Session expired — re-login triggered");
  session = null;
  forceLogin = true;
}
