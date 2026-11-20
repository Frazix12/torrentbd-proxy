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

// TorrentBD's real auth cookie is `ts_argon`. `user`/`x_auth` are kept for
// compatibility with older site versions and profiles.
export const SESSION_COOKIE_NAMES = ["ts_argon", "user", "x_auth"] as const;

let session: Session | null = null;
let forceLogin = false;
let sessionSyncInProgress: Promise<void> | null = null;

export function hasSessionCookie(
  cookies: Array<{ name: string; value: string }>,
): boolean {
  return cookies.some(
    (c) =>
      (SESSION_COOKIE_NAMES as readonly string[]).includes(c.name) &&
      Boolean(c.value),
  );
}

export function getSessionCookieNames(
  cookies: Array<{ name: string; value?: string }>,
): string[] {
  return cookies
    .filter((cookie) =>
      (SESSION_COOKIE_NAMES as readonly string[]).includes(cookie.name),
    )
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

const TURNSTILE_FRAME_URLS = ["challenges.cloudflare.com", "challenge-platform"];
const MIN_CLICK_INTERVAL_MS = 2500;

async function turnstileResponseSolved(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      const fields = document.querySelectorAll<HTMLInputElement>(
        'input[name="cf-turnstile-response"]',
      );
      return Array.from(fields).some((field) => Boolean(field.value));
    });
  } catch {
    return false;
  }
}

async function solveTurnstileUntilResolved(
  page: Page,
  isTargetResolved: () => Promise<boolean>,
  maxWaitMs = 45000,
): Promise<boolean> {
  const start = Date.now();
  let lastClickTime = 0;
  let failedClicks = 0;
  let reloads = 0;
  let loggedFrameUrl = "";

  while (Date.now() - start < maxWaitMs) {
    if (await isTargetResolved()) return true;
    if (await turnstileResponseSolved(page)) {
      console.log("[session] Cloudflare Turnstile challenge solved.");
      runtimeStatus.record("info", "Cloudflare Turnstile challenge solved.");
      return true;
    }

    const frame = page
      .frames()
      .find((f: Frame) =>
        TURNSTILE_FRAME_URLS.some((needle) => f.url().includes(needle)),
      );

    if (frame) {
      const frameUrl = frame.url();
      if (frameUrl !== loggedFrameUrl) {
        loggedFrameUrl = frameUrl;
        console.log(
          "[session] Cloudflare Turnstile challenge detected — attempting to solve...",
        );
        runtimeStatus.record(
          "info",
          "Cloudflare Turnstile challenge detected — attempting to solve...",
        );
      }

      const now = Date.now();
      if (now - lastClickTime > MIN_CLICK_INTERVAL_MS) {
        let clicked = false;

        // Prefer clicking the real checkbox inside the challenge iframe.
        for (const selector of [
          'input[type="checkbox"]',
          ".cf-turnstile",
          '[role="checkbox"]',
        ]) {
          try {
            const locator = frame.locator(selector).first();
            if ((await locator.count()) === 0) continue;
            await locator.click({ timeout: 1500, force: true });
            clicked = true;
            break;
          } catch {
            // Selector did not match or element was not clickable — try the next one.
          }
        }

        // Fall back to a click near the checkbox inside the widget bounding box.
        if (!clicked) {
          try {
            const frameEl = await frame.frameElement();
            const box = await frameEl.boundingBox();
            if (box && box.width > 0 && box.height > 0) {
              await page.mouse.click(box.x + 14, box.y + box.height / 2);
              clicked = true;
            }
          } catch {
            // Frame may be re-rendering or navigating.
          }
        }

        if (clicked) {
          lastClickTime = Date.now();
          failedClicks += 1;
          console.log(
            `[session] Clicked Turnstile verification box (attempt ${failedClicks})...`,
          );
          runtimeStatus.record(
            "info",
            `Clicked Turnstile verification box (attempt ${failedClicks})...`,
          );
        }
      }
    }

    // If repeated clicks make no progress, reload to get a fresh challenge.
    if (failedClicks >= 6 && reloads < 2) {
      reloads += 1;
      failedClicks = 0;
      lastClickTime = Date.now();
      console.log(
        `[session] Turnstile not resolving — reloading challenge (${reloads}/2). ` +
          "If this keeps happening, set a free CLOAKBROWSER_LICENSE_KEY in .env and rebuild " +
          "to use the latest browser build that auto-solves challenges.",
      );
      runtimeStatus.record(
        "warn",
        `Turnstile not resolving — reloading challenge (${reloads}/2).`,
      );
      try {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 25000 });
      } catch {
        // Navigation may have been interrupted; keep looping.
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
      null,
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
      null,
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
        null,
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
          setTimeout(() => reject(new Error("context.close() timeout")), 10000),
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
        (SESSION_COOKIE_NAMES as readonly string[]).includes(c.name) &&
        c.expires !== undefined &&
        c.expires > 0 &&
        c.expires - nowSec < 300,
    );
    if (expiringSoon) {
      console.log(
        "[session] Auth cookie expiring soon — proactively re-authenticating.",
      );
      runtimeStatus.record(
        "warn",
        "Auth cookie expiring soon — proactively re-authenticating.",
      );
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
