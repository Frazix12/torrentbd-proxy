import { describe, expect, it } from "bun:test";
import { createApp } from "../index";
import { redact } from "../logger";
import { safeEqual } from "../auth";
import { singleFlight } from "../inflight";
import { metrics } from "../metrics";

describe("security & infrastructure", () => {
  it("redacts API keys and dashboard keys from log strings", () => {
    expect(redact("GET /api?t=search&apikey=secret123 -> 200")).toBe(
      "GET /api?t=search&apikey=<redacted> -> 200",
    );
    expect(redact("X-Dashboard-Key: abc123")).toBe(
      "X-Dashboard-Key: <redacted>",
    );
  });

  it("compares secrets in constant time", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "other")).toBe(false);
    expect(safeEqual("secret", "secre")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
  });

  it("accepts the Torznab API key from either query or header", async () => {
    const app = createApp();
    const viaQuery = await app.request("/api?t=caps&apikey=k");
    expect(viaQuery.status).toBe(200);

    const viaHeader = await app.request("/api?t=caps", {
      headers: { "X-Api-Key": "k" },
    });
    expect(viaHeader.status).toBe(200);

    const rejected = await app.request("/api?t=caps&apikey=wrong");
    expect(rejected.status).toBe(403);
  });

  it("exposes the UI config endpoint when dashboard auth is unset", async () => {
    const app = createApp();
    const res = await app.request("/api/ui/config");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { authRequired: boolean; version: string };
    expect(body.authRequired).toBe(false);
    expect(typeof body.version).toBe("string");
  });

  it("collapses concurrent identical work into one call", async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return calls;
    };
    const results = await Promise.all([
      singleFlight("key", fn),
      singleFlight("key", fn),
      singleFlight("key", fn),
    ]);
    expect(calls).toBe(1);
    expect(results).toEqual([1, 1, 1]);
  });

  it("tracks metrics in the documented shape", () => {
    metrics.request(200);
    metrics.cacheHit();
    metrics.login();
    const snap = metrics.snapshot();
    expect(snap.requests.total).toBeGreaterThan(0);
    expect(snap.cache.hits).toBeGreaterThan(0);
    expect(snap.sessions.logins).toBeGreaterThan(0);
    expect(typeof snap.requests.byStatus).toBe("object");
  });
});
