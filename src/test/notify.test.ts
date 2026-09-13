import { describe, expect, it } from "bun:test";

// notify is imported once — config is read at call time, so we patch process.env
// and rely on the config object being live (it reads process.env at module load,
// but notifyWebhookUrl is looked up at call time via config.notifyWebhookUrl).
// To avoid module-cache issues we test the logic directly by inspecting fetch calls.

const capturedFetches: { url: string; body: string; ct: string }[] = [];

// Intercept fetch globally before any imports
const originalFetch = global.fetch;
global.fetch = (async (
  url: string | Request | URL,
  init?: RequestInit,
) => {
  capturedFetches.push({
    url: String(url instanceof Request ? url.url : url),
    body: String(init?.body ?? ""),
    ct: (init?.headers as Record<string, string>)?.["Content-Type"] ?? "",
  });
  return new Response("ok");
}) as typeof fetch;

// Now import notify (fetch is already patched)
const { notify } = await import("../notify");
const { config } = await import("../config");

describe("notify", () => {
  it("is a no-op when notifyWebhookUrl is empty", async () => {
    capturedFetches.length = 0;
    const orig = config.notifyWebhookUrl;
    config.notifyWebhookUrl = "";
    notify("test message");
    await new Promise((r) => setTimeout(r, 20));
    expect(capturedFetches).toHaveLength(0);
    config.notifyWebhookUrl = orig;
  });

  it("sends plain text for ntfy-style URLs", async () => {
    capturedFetches.length = 0;
    config.notifyWebhookUrl = "https://ntfy.sh/my-topic";
    notify("ntfy message");
    await new Promise((r) => setTimeout(r, 20));
    expect(capturedFetches).toHaveLength(1);
    expect(capturedFetches[0].body).toBe("ntfy message");
    expect(capturedFetches[0].ct).toBe("text/plain");
    config.notifyWebhookUrl = "";
  });

  it("sends JSON for Discord webhook URLs", async () => {
    capturedFetches.length = 0;
    config.notifyWebhookUrl = "https://discord.com/api/webhooks/123/abc";
    notify("discord message");
    await new Promise((r) => setTimeout(r, 20));
    expect(capturedFetches).toHaveLength(1);
    expect(capturedFetches[0].ct).toBe("application/json");
    const parsed = JSON.parse(capturedFetches[0].body);
    expect(parsed.content).toBe("discord message");
    config.notifyWebhookUrl = "";
  });

  it("restores fetch after suite", () => {
    global.fetch = originalFetch;
    expect(true).toBe(true);
  });
});
