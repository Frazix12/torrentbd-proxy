import { describe, expect, it, mock } from "bun:test";

process.env.TBD_USERNAME ??= "test-user";
process.env.TBD_PASSWORD ??= "test-password";
process.env.TBD_TOTP_SECRET ??= "JBSWY3DPEHPK3PXP";
process.env.PROXY_API_KEY ??= "test-key";
process.env.TBD_BASE_URL ??= "https://www.torrentbd.net";

import { createReseedStore } from "../reseed-store";
import { createReseedSynchronizer, syncReseedRequests } from "../reseed-sync";
import type { StatusLevel } from "../status";

const makePage = (id: string, title: string, nextUrl: string | null = null) => `
<table class="reseed-list">
  <thead><tr>
    <th>Torrent</th><th>Category</th><th>Requested By</th>
    <th>Seed Bonus</th><th>Size</th><th>Seeders</th>
    <th>Leechers</th><th>Requested</th><th>Reason</th>
  </tr></thead>
  <tbody><tr>
    <td><a href="/torrents-details.php?id=${id}">${title}</a></td>
    <td>Software</td><td>Alice</td><td>1,500 points</td>
    <td>2.5 GiB</td><td>0</td><td>3</td><td>2026-09-07</td>
    <td>Please reseed</td>
  </tr></tbody>
</table>
${nextUrl ? `<a rel="next" href="${nextUrl}">Next</a>` : ""}`;

describe("reseed sync", () => {
  it("aggregates multiple pagination pages and replaces store snapshot", async () => {
    const page1 = makePage("42", "Ubuntu Archive", "/reseed-requests.php?page=2");
    const page2 = makePage("43", "Debian Archive", null);

    const pages: Record<string, string> = {
      "https://www.torrentbd.net/reseed-requests.php": page1,
      "https://www.torrentbd.net/reseed-requests.php?page=2": page2,
    };

    const fetchPage = mock(async (url?: string) => {
      const target = url ?? "https://www.torrentbd.net/reseed-requests.php";
      const html = pages[target];
      if (!html) throw new Error(`Unexpected URL: ${target}`);
      return html;
    });

    const store = createReseedStore(":memory:");
    const records: Array<{ level: StatusLevel; msg: string }> = [];

    const count = await syncReseedRequests({
      baseUrl: "https://www.torrentbd.net",
      fetchPage,
      store,
      record: (level: StatusLevel, msg: string) => records.push({ level, msg }),
      now: () => "2026-09-08T00:00:00Z",
    });

    expect(count).toBe(2);
    expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([
      "https://www.torrentbd.net/reseed-requests.php",
      "https://www.torrentbd.net/reseed-requests.php?page=2",
    ]);
    expect(store.list().map((item) => item.torrentId)).toEqual(["43", "42"]);
    expect(store.metadata()).toEqual(
      expect.objectContaining({
        state: "idle",
        lastSuccessfulSyncAt: "2026-09-08T00:00:00Z",
        lastError: null,
      }),
    );
    store.close();
  });

  it("deduplicates requests with the same torrent ID across pages", async () => {
    const page1 = makePage("42", "Page 1 Title", "/reseed-requests.php?page=2");
    const page2 = makePage("42", "Page 2 Title", null);

    const pages: Record<string, string> = {
      "https://www.torrentbd.net/reseed-requests.php": page1,
      "https://www.torrentbd.net/reseed-requests.php?page=2": page2,
    };

    const fetchPage = mock(async (url?: string) => {
      const target = url ?? "https://www.torrentbd.net/reseed-requests.php";
      return pages[target];
    });

    const store = createReseedStore(":memory:");
    const count = await syncReseedRequests({
      baseUrl: "https://www.torrentbd.net",
      fetchPage,
      store,
      record: () => {},
      now: () => "2026-09-08T00:00:00Z",
    });

    expect(count).toBe(1);
    expect(store.list().map((item) => item.torrentId)).toEqual(["42"]);
    store.close();
  });

  it("throws Pagination loop detected on cyclic pagination links", async () => {
    const page1 = makePage("42", "Ubuntu", "/reseed-requests.php?page=2");
    const page2 = makePage("43", "Debian", "/reseed-requests.php");

    const pages: Record<string, string> = {
      "https://www.torrentbd.net/reseed-requests.php": page1,
      "https://www.torrentbd.net/reseed-requests.php?page=2": page2,
    };

    const fetchPage = mock(async (url?: string) => pages[url!]);
    const store = createReseedStore(":memory:");
    const records: Array<{ level: StatusLevel; msg: string }> = [];

    await expect(
      syncReseedRequests({
        baseUrl: "https://www.torrentbd.net",
        fetchPage,
        store,
        record: (level: StatusLevel, msg: string) => records.push({ level, msg }),
        now: () => "2026-09-08T00:00:00Z",
      }),
    ).rejects.toThrow("Pagination loop detected");

    expect(store.metadata().state).toBe("error");
    expect(store.metadata().lastError).toContain("Pagination loop detected");
    expect(records.some((r) => r.level === "error" && r.msg.includes("Pagination loop detected"))).toBe(true);
    store.close();
  });

  it("leaves preloaded snapshot untouched if a subsequent page fails", async () => {
    const page1 = makePage("42", "Ubuntu", "/reseed-requests.php?page=2");

    const store = createReseedStore(":memory:");
    store.replaceSnapshot(
      [
        {
          torrentId: "99",
          title: "Preloaded",
          category: null,
          requester: null,
          seedBonus: null,
          seedBonusText: null,
          sizeBytes: null,
          sizeText: null,
          seeders: null,
          leechers: null,
          requestedAt: "2026-09-01",
          detailsUrl: "https://www.torrentbd.net/torrents-details.php?id=99",
          details: {},
        },
      ],
      "2026-09-07T00:00:00Z",
    );

    const fetchPage = mock(async (url?: string) => {
      if (url === "https://www.torrentbd.net/reseed-requests.php?page=2") {
        throw new Error("Network connection reset");
      }
      return page1;
    });

    await expect(
      syncReseedRequests({
        baseUrl: "https://www.torrentbd.net",
        fetchPage,
        store,
        record: () => {},
        now: () => "2026-09-08T00:00:00Z",
      }),
    ).rejects.toThrow("Network connection reset");

    expect(store.list().map((item) => item.torrentId)).toEqual(["99"]);
    expect(store.metadata().state).toBe("error");
    expect(store.metadata().lastError).toContain("Network connection reset");
    store.close();
  });

  it("guards against concurrent synchronizations with createReseedSynchronizer", async () => {
    let resolveFetch!: (html: string) => void;
    const deferred = new Promise<string>((resolve) => {
      resolveFetch = resolve;
    });

    const fetchPage = mock(async () => deferred);
    const store = createReseedStore(":memory:");
    const records: Array<{ level: StatusLevel; msg: string }> = [];

    const synchronizer = createReseedSynchronizer({
      baseUrl: "https://www.torrentbd.net",
      fetchPage,
      store,
      record: (level: StatusLevel, msg: string) => records.push({ level, msg }),
      now: () => "2026-09-08T00:00:00Z",
    });

    expect(synchronizer.isRunning()).toBe(false);

    const first = synchronizer.start();
    const second = synchronizer.start();

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(synchronizer.isRunning()).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(1);

    resolveFetch(makePage("42", "Ubuntu", null));

    // Wait until background sync completes and guard resets
    for (let i = 0; i < 50; i++) {
      if (!synchronizer.isRunning()) break;
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(synchronizer.isRunning()).toBe(false);
    expect(store.list().map((item) => item.torrentId)).toEqual(["42"]);
    expect(records.some((r) => r.level === "info" && r.msg.includes("Successfully synchronized"))).toBe(true);
    store.close();
  });

  it("startPolling runs immediately and sets an interval timer", async () => {
    const page = makePage("42", "Ubuntu", null);
    const fetchPage = mock(async () => page);
    const store = createReseedStore(":memory:");

    const synchronizer = createReseedSynchronizer({
      baseUrl: "https://www.torrentbd.net",
      fetchPage,
      store,
      record: () => {},
    });

    const timer = synchronizer.startPolling(5000);
    expect(timer).toBeDefined();
    expect(fetchPage).toHaveBeenCalled();

    clearInterval(timer);
    store.close();
  });
});
