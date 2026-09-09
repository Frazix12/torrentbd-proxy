import { describe, expect, it } from "bun:test";
import { createReseedStore } from "../reseed-store";

const first = {
  torrentId: "42",
  title: "One",
  category: "TV",
  requester: "Alice",
  seedBonus: 100,
  seedBonusText: "100",
  sizeBytes: 1024,
  sizeText: "1 KiB",
  seeders: 0,
  leechers: 1,
  requestedAt: "2026-09-01",
  detailsUrl: "https://www.torrentbd.net/torrents-details.php?id=42",
  details: { Reason: "Needed" },
};

describe("reseed store", () => {
  it("initializes with idle metadata and empty requests", () => {
    const store = createReseedStore(":memory:");
    expect(store.list()).toEqual([]);
    expect(store.metadata()).toEqual({
      state: "idle",
      lastAttemptedSyncAt: null,
      lastSuccessfulSyncAt: null,
      lastError: null,
    });
    store.close();
  });

  it("atomically replaces and deletes missing requests", () => {
    const store = createReseedStore(":memory:");
    store.replaceSnapshot(
      [first, { ...first, torrentId: "43", title: "Two" }],
      "2026-09-08T00:00:00Z",
    );
    store.replaceSnapshot(
      [{ ...first, title: "Updated" }],
      "2026-09-08T00:05:00Z",
    );
    expect(store.list().map((item) => item.torrentId)).toEqual(["42"]);
    expect(store.list()[0].title).toBe("Updated");
    expect(store.list()[0].lastSeenAt).toBe("2026-09-08T00:05:00Z");
    expect(store.list()[0].details).toEqual({ Reason: "Needed" });
    expect(store.metadata().lastSuccessfulSyncAt).toBe("2026-09-08T00:05:00Z");
    expect(store.metadata().state).toBe("idle");
    expect(store.metadata().lastError).toBeNull();
    store.close();
  });

  it("records failure without changing requests", () => {
    const store = createReseedStore(":memory:");
    store.replaceSnapshot([first], "2026-09-08T00:00:00Z");
    store.markFailed("2026-09-08T00:05:00Z", "network down");
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].torrentId).toBe("42");
    expect(store.metadata()).toEqual(
      expect.objectContaining({
        state: "error",
        lastError: "network down",
        lastAttemptedSyncAt: "2026-09-08T00:05:00Z",
        lastSuccessfulSyncAt: "2026-09-08T00:00:00Z",
      }),
    );
    store.close();
  });

  it("marks running state and records attempt timestamp", () => {
    const store = createReseedStore(":memory:");
    store.markRunning("2026-09-08T00:10:00Z");
    expect(store.metadata()).toEqual(
      expect.objectContaining({
        state: "running",
        lastAttemptedSyncAt: "2026-09-08T00:10:00Z",
      }),
    );
    store.close();
  });

  it("sorts list deterministically by requested_at DESC, torrent_id DESC", () => {
    const store = createReseedStore(":memory:");
    store.replaceSnapshot(
      [
        { ...first, torrentId: "10", requestedAt: "2026-09-01" },
        { ...first, torrentId: "30", requestedAt: "2026-09-05" },
        { ...first, torrentId: "20", requestedAt: "2026-09-05" },
        { ...first, torrentId: "5", requestedAt: null },
      ],
      "2026-09-08T00:00:00Z",
    );
    const ids = store.list().map((item) => item.torrentId);
    expect(ids).toEqual(["30", "20", "10", "5"]);
    store.close();
  });

  it("preserves previous snapshot if replacement fails", () => {
    const store = createReseedStore(":memory:");
    store.replaceSnapshot([first], "2026-09-08T00:00:00Z");
    expect(() => {
      store.replaceSnapshot(
        [
          { ...first, torrentId: "99", title: "Ninety-nine" },
          { ...first, torrentId: "99", title: "Duplicate" },
        ],
        "2026-09-08T00:05:00Z",
      );
    }).toThrow();
    expect(store.list().map((item) => item.torrentId)).toEqual(["42"]);
    store.close();
  });

  it("persists snapshot to a file-backed database across store instances", () => {
    const tempDbPath = `/tmp/test-reseed-${Date.now()}.sqlite`;
    const store1 = createReseedStore(tempDbPath);
    store1.replaceSnapshot([first], "2026-09-08T00:00:00Z");
    store1.close();

    const store2 = createReseedStore(tempDbPath);
    expect(store2.list().map((item) => item.torrentId)).toEqual(["42"]);
    expect(store2.metadata().lastSuccessfulSyncAt).toBe("2026-09-08T00:00:00Z");
    store2.close();
    try {
      require("node:fs").unlinkSync(tempDbPath);
    } catch {
      // ignore
    }
  });

  it("config provides reseedDbPath defaulting to :memory: in test", async () => {
    process.env.TBD_USERNAME = process.env.TBD_USERNAME || "test";
    process.env.TBD_PASSWORD = process.env.TBD_PASSWORD || "test";
    process.env.TBD_TOTP_SECRET = process.env.TBD_TOTP_SECRET || "SECRET";
    process.env.PROXY_API_KEY = process.env.PROXY_API_KEY || "key";
    const { config } = await import("../config");
    expect(config.reseedDbPath).toBe(":memory:");
  });
});
