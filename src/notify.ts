// src/notify.ts
// Fire-and-forget webhook notifications for failures and session events.
// Supports ntfy.sh (plain text POST), Discord, and Slack (JSON body).
// No-op when NOTIFY_WEBHOOK_URL is not set.

import { config } from "./config";

const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const recentNotifications = new Map<string, number>();

function isDuplicate(message: string): boolean {
  const now = Date.now();
  const last = recentNotifications.get(message);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return true;

  recentNotifications.set(message, now);
  // Keep the map bounded (one entry per distinct message).
  if (recentNotifications.size > 100) {
    for (const [key, sentAt] of recentNotifications) {
      if (now - sentAt > DEDUPE_WINDOW_MS) recentNotifications.delete(key);
    }
  }
  return false;
}

async function post(url: string, init: RequestInit): Promise<void> {
  try {
    await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
  } catch {
    // One retry after a short pause — webhooks are best-effort.
    await new Promise((resolve) => setTimeout(resolve, 750));
    try {
      await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
    } catch (err) {
      console.error("[notify] Webhook failed:", err);
    }
  }
}

export function notify(message: string, force = false): void {
  if (!config.notifyWebhookUrl) return;
  if (!force && isDuplicate(message)) return;

  const url = config.notifyWebhookUrl;
  const isJsonHook =
    url.includes("discord.com") || url.includes("hooks.slack.com");
  const body = isJsonHook ? JSON.stringify({ content: message }) : message;
  const headers: Record<string, string> = isJsonHook
    ? { "Content-Type": "application/json" }
    : { "Content-Type": "text/plain" };

  void post(url, { method: "POST", headers, body });
}
