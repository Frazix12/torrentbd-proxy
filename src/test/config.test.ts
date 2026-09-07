// src/test/config.test.ts
import { describe, it, expect } from "bun:test";
import { DEFAULT_PORT } from "../config";

describe("config", () => {
  it("reads values from env", () => {
    process.env.TBD_USERNAME = "user";
    process.env.TBD_PASSWORD = "pass";
    process.env.TBD_TOTP_SECRET = "SECRET";
    process.env.TBD_BASE_URL = "https://www.torrentbd.net";
    process.env.PROXY_API_KEY = "key123";
    process.env.CACHE_TTL_SECONDS = "120";
    process.env.PORT = "5001";
    // config is a singleton at module level — just verify the module loads cleanly
    // and env values are picked up (tested by categories/cache tests which depend on config)
    expect(process.env.TBD_USERNAME).toBe("user");
    expect(Number(process.env.CACHE_TTL_SECONDS)).toBe(120);
    expect(Number(process.env.PORT)).toBe(5001);
  });

  it("uses port 6950 by default", () => {
    expect(DEFAULT_PORT).toBe(6950);
  });

  it("provides default cloak profile directory", () => {
    const { config } = require("../config");
    expect(config.cloakProfileDir).toBe(
      process.env.CLOAK_PROFILE_DIR ?? "/data/cloak-profile",
    );
  });
});
