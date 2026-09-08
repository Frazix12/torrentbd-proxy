// src/test/reseed-routes.test.ts
import { describe, expect, it } from "bun:test";

process.env.TBD_USERNAME = "test_user";
process.env.TBD_PASSWORD = "test_password";
process.env.TBD_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
process.env.PROXY_API_KEY = "test_proxy_key_secret_12345";
process.env.NODE_ENV = "test";

const { app, torrentDownloadResponse } = await import("../index");

describe("reseed routes", () => {
  it("serves HTML dashboard at GET /reseed", async () => {
    const res = await app.request("/reseed");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("TorrentBD Reseed Requests");
  });

  it("serves javascript module at GET /reseed-ui.js", async () => {
    const res = await app.request("/reseed-ui.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
    const text = await res.text();
    expect(text).toContain("filterRequests");
  });

  it("serves reseed snapshot data at GET /reseed-data without sensitive fields", async () => {
    const res = await app.request("/reseed-data");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = (await res.json()) as {
      requests: unknown[];
      count: number;
      totalSeedBonus: number;
      sync: { state: string };
    };

    expect(data).toEqual(
      expect.objectContaining({
        requests: expect.any(Array),
        count: expect.any(Number),
        totalSeedBonus: expect.any(Number),
        sync: expect.objectContaining({ state: expect.any(String) }),
      }),
    );

    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("test_proxy_key_secret_12345");
    expect(serialized).not.toContain("test_password");
    expect(serialized).not.toContain("test_user");
    expect(serialized).not.toContain("cookie");
  });

  it("handles POST /reseed-refresh returning started status and sync metadata", async () => {
    const res = await app.request("/reseed-refresh", { method: "POST" });
    expect([200, 202]).toContain(res.status);
    const body = (await res.json()) as {
      started: boolean;
      sync: { state: string };
    };
    expect(typeof body.started).toBe("boolean");
    expect(body.sync).toBeDefined();
    expect(typeof body.sync.state).toBe("string");
  });

  it("validates id parameter on GET /reseed-download", async () => {
    const resInvalid = await app.request("/reseed-download?id=abc");
    expect(resInvalid.status).toBe(400);

    const resMissing = await app.request("/reseed-download");
    expect(resMissing.status).toBe(400);

    const resNegative = await app.request("/reseed-download?id=-5");
    expect(resNegative.status).toBe(400);
  });

  it("streams torrent via torrentDownloadResponse on successful download", async () => {
    const mockDownloader = async (id: string) => {
      return new Response("dummy torrent binary content", {
        status: 200,
        headers: {
          "Content-Type": "application/x-bittorrent",
          "Content-Disposition": `attachment; filename="${id}.torrent"`,
        },
      });
    };

    const res = await torrentDownloadResponse("42", mockDownloader);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-bittorrent");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="42.torrent"',
    );
    const bodyText = await res.text();
    expect(bodyText).toBe("dummy torrent binary content");
  });

  it("handles downloader failure in torrentDownloadResponse with HTTP 502", async () => {
    const throwingDownloader = async (_id: string): Promise<Response> => {
      throw new Error("Upstream network connection timed out");
    };

    const res = await torrentDownloadResponse("99", throwingDownloader);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain("Download failed: Error: Upstream network connection timed out");
  });
});
