// src/notify.ts
// Fire-and-forget webhook notifications for failures and session events.
// Supports ntfy.sh (plain text POST), Discord, and Slack (JSON body).
// No-op when NOTIFY_WEBHOOK_URL is not set.

import { config } from "./config";

export function notify(message: string): void {
  if (!config.notifyWebhookUrl) return;

  const url = config.notifyWebhookUrl;
  const isJsonHook =
    url.includes("discord.com") || url.includes("hooks.slack.com");
  const body = isJsonHook ? JSON.stringify({ content: message }) : message;
  const headers: Record<string, string> = isJsonHook
    ? { "Content-Type": "application/json" }
    : { "Content-Type": "text/plain" };

  fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(5000),
  }).catch((err) => console.error("[notify] Webhook failed:", err));
  // ponytail: fire-and-forget; add await + retry queue if delivery guarantees matter
}
