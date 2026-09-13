import { describe, expect, it } from "bun:test";
import { rateLimit } from "../rate-limit";

describe("rateLimit", () => {
  it("allows requests under the limit", () => {
    const ip = `test-${Date.now()}-allow`;
    expect(rateLimit(ip, 3, 60_000)).toBe(true);
    expect(rateLimit(ip, 3, 60_000)).toBe(true);
    expect(rateLimit(ip, 3, 60_000)).toBe(true);
  });

  it("blocks on the request that exceeds the limit", () => {
    const ip = `test-${Date.now()}-block`;
    rateLimit(ip, 2, 60_000);
    rateLimit(ip, 2, 60_000);
    expect(rateLimit(ip, 2, 60_000)).toBe(false);
  });

  it("allows again after the window expires", async () => {
    const ip = `test-${Date.now()}-expire`;
    const windowMs = 50;
    rateLimit(ip, 1, windowMs);
    expect(rateLimit(ip, 1, windowMs)).toBe(false);
    await new Promise((r) => setTimeout(r, windowMs + 10));
    expect(rateLimit(ip, 1, windowMs)).toBe(true);
  });

  it("isolates per IP", () => {
    const ip1 = `test-${Date.now()}-a`;
    const ip2 = `test-${Date.now()}-b`;
    rateLimit(ip1, 1, 60_000);
    // ip1 is now at limit, ip2 should still be allowed
    expect(rateLimit(ip1, 1, 60_000)).toBe(false);
    expect(rateLimit(ip2, 1, 60_000)).toBe(true);
  });
});
