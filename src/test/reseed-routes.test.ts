// src/test/reseed-routes.test.ts
import { describe, expect, it } from "bun:test";
import { createReseedStore } from "../reseed-store";
import type { ReseedSynchronizer } from "../reseed-sync";

process.env.TBD_USERNAME = "test_user";
process.env.TBD_PASSWORD = "test_password";
process.env.TBD_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
process.env.PROXY_API_KEY = "test_proxy_key_secret_12345";
process.env.NODE_ENV = "test";

const {
  app,
  createApp,
  setReseedSynchronizer,
  torrentDownloadResponse,
} = await import("../index");

let mockSyncRunning = false;
let mockStartCount = 0;
const mockSynchronizer: ReseedSynchronizer = {
  start: () => {
    if (mockSyncRunning) return false;
    mockStartCount++;
    return true;
  },
  isRunning: () => mockSyncRunning,
  startPolling: () => setInterval(() => {}, 100000),
};

// Wire the mock synchronizer to guarantee no upstream network calls during tests
setReseedSynchronizer(mockSynchronizer);

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

  it("handles POST /reseed-refresh with offline mock synchronizer", async () => {
    mockSyncRunning = false;
    mockStartCount = 0;

    // First request: starts refresh -> 202
    const resStarted = await app.request("/reseed-refresh", { method: "POST" });
    expect(resStarted.status).toBe(202);
    const bodyStarted = (await resStarted.json()) as {
      started: boolean;
      sync: { state: string };
    };
    expect(bodyStarted.started).toBe(true);
    expect(mockStartCount).toBe(1);

    // Second request when already running -> 200
    mockSyncRunning = true;
    const resRunning = await app.request("/reseed-refresh", { method: "POST" });
    expect(resRunning.status).toBe(200);
    const bodyRunning = (await resRunning.json()) as {
      started: boolean;
      sync: { state: string };
    };
    expect(bodyRunning.started).toBe(false);

    mockSyncRunning = false;
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
    expect(text).toContain(
      "Download failed: Error: Upstream network connection timed out",
    );
  });

  it("supports createApp with dependency injection for fully isolated route testing", async () => {
    const isolatedStore = createReseedStore(":memory:");
    isolatedStore.replaceSnapshot(
      [
        {
          torrentId: "101",
          title: "Isolated Torrent",
          category: "Apps",
          requester: "Tester",
          seedBonus: 500,
          seedBonusText: "500",
          sizeBytes: 1048576,
          sizeText: "1 MB",
          seeders: 2,
          leechers: 0,
          requestedAt: "2026-09-08",
          detailsUrl: "https://www.torrentbd.net/torrents-details.php?id=101",
          details: {},
        },
      ],
      "2026-09-08T12:00:00Z",
    );

    let injectedSyncCalled = false;
    const injectedSync: ReseedSynchronizer = {
      start: () => {
        injectedSyncCalled = true;
        return true;
      },
      isRunning: () => false,
      startPolling: () => setInterval(() => {}, 100000),
    };

    const injectedDownloader = async (id: string) => {
      if (id === "fail") {
        throw new Error("Simulated upstream error");
      }
      return new Response("binary torrent data", {
        status: 200,
        headers: {
          "Content-Type": "application/x-bittorrent",
          "Content-Disposition": `attachment; filename="${id}.torrent"`,
        },
      });
    };

    const isolatedApp = createApp({
      reseedStore: isolatedStore,
      reseedSynchronizer: injectedSync,
      downloader: injectedDownloader,
    });

    // Test GET /reseed-data with isolated store
    const dataRes = await isolatedApp.request("/reseed-data");
    expect(dataRes.status).toBe(200);
    const dataJson = (await dataRes.json()) as {
      count: number;
      totalSeedBonus: number;
      requests: Array<{ torrentId: string; title: string }>;
    };
    expect(dataJson.count).toBe(1);
    expect(dataJson.totalSeedBonus).toBe(500);
    expect(dataJson.requests[0].torrentId).toBe("101");

    // Test POST /reseed-refresh with isolated synchronizer
    const refreshRes = await isolatedApp.request("/reseed-refresh", {
      method: "POST",
    });
    expect(refreshRes.status).toBe(202);
    expect(injectedSyncCalled).toBe(true);

    // Test GET /reseed-download with injected downloader
    const dlSuccess = await isolatedApp.request("/reseed-download?id=101");
    expect(dlSuccess.status).toBe(200);
    expect(dlSuccess.headers.get("Content-Type")).toBe(
      "application/x-bittorrent",
    );
    expect(await dlSuccess.text()).toBe("binary torrent data");

    // Test GET /reseed-download error mapping
    const dlFail = await isolatedApp.request("/reseed-download?id=0"); // id "0" passes regex /^\d+$/ but we can handle failure
    const dlFailureDirect = await torrentDownloadResponse("fail", injectedDownloader);
    expect(dlFailureDirect.status).toBe(502);

    isolatedStore.close();
  });
});
