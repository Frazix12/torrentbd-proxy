// Tests for stored session selection logic.
import { describe, expect, it } from "bun:test";
import {
  getSessionCookieNames,
  hasSessionCookie,
  shouldReuseStoredCookies,
} from "../session";

describe("stored session selection", () => {
  it("detects when session cookies are absent", () => {
    expect(hasSessionCookie([])).toBe(false);
    expect(
      hasSessionCookie([
        { name: "cf_clearance", value: "abc" },
        { name: "theme", value: "dark" },
      ]),
    ).toBe(false);
    expect(hasSessionCookie([{ name: "user", value: "" }])).toBe(false);
  });

  it("detects valid session cookies", () => {
    expect(hasSessionCookie([{ name: "user", value: "12345" }])).toBe(true);
    expect(hasSessionCookie([{ name: "x_auth", value: "tokenxyz" }])).toBe(
      true,
    );
  });

  it("reuses stored cookies only when not forced to re-login", () => {
    const cookies = [{ name: "user", value: "12345" }];
    expect(shouldReuseStoredCookies(cookies, false)).toBe(true);
    expect(shouldReuseStoredCookies(cookies, true)).toBe(false);
  });

  it("does not reuse empty or invalid cookies even when not forced", () => {
    expect(shouldReuseStoredCookies([], false)).toBe(false);
    expect(
      shouldReuseStoredCookies([{ name: "theme", value: "dark" }], false),
    ).toBe(false);
  });

  it("selects only TorrentBD session cookies for clearing", () => {
    expect(
      getSessionCookieNames([
        { name: "cf_clearance", value: "challenge" },
        { name: "user", value: "expired" },
        { name: "x_auth", value: "expired" },
      ]),
    ).toEqual(["user", "x_auth"]);
  });
});
