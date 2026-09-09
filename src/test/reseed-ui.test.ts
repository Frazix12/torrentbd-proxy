// src/test/reseed-ui.test.ts
import { describe, expect, it } from "bun:test";
import {
  filterRequests,
  paginateRequests,
  sortRequests,
} from "../reseed-ui.js";

const rows = [
  {
    torrentId: "1",
    title: "Ubuntu",
    category: "Software",
    requester: "Alice",
    seedBonus: 100,
    sizeBytes: 1000,
    requestedAt: "2026-09-01",
  },
  {
    torrentId: "2",
    title: "Movie",
    category: "Movies",
    requester: "Bob",
    seedBonus: 500,
    sizeBytes: 5000,
    requestedAt: "2026-09-07",
  },
];

describe("reseed-ui filter and sort", () => {
  it("combines text, category, and range filters with AND semantics", () => {
    expect(
      filterRequests(rows, {
        query: "movie",
        category: "Movies",
        requester: "",
        minBonus: 400,
        maxBonus: null,
        minSize: null,
        maxSize: 6000,
        fromDate: "2026-09-01",
        toDate: "2026-09-08",
      }).map((row) => row.torrentId),
    ).toEqual(["2"]);
  });

  it("sorts without mutating input", () => {
    expect(
      sortRequests(rows, { key: "seedBonus", direction: "desc" })[0].torrentId,
    ).toBe("2");
    expect(rows[0].torrentId).toBe("1");
  });

  it("filters by torrent ID in text query", () => {
    expect(
      filterRequests(rows, { query: "1" }).map((r) => r.torrentId),
    ).toEqual(["1"]);
  });

  it("filters by requester in text query", () => {
    expect(
      filterRequests(rows, { query: "alice" }).map((r) => r.torrentId),
    ).toEqual(["1"]);
  });

  it("filters by requester dropdown", () => {
    expect(
      filterRequests(rows, { requester: "Bob" }).map((r) => r.torrentId),
    ).toEqual(["2"]);
  });

  it("filters with null numeric fields", () => {
    const mixed = [
      ...rows,
      {
        torrentId: "3",
        title: "No bonus",
        category: "Music",
        requester: "Charlie",
        seedBonus: null,
        sizeBytes: null,
        requestedAt: null,
      },
    ];
    expect(
      filterRequests(mixed, { minBonus: 50 }).map((r) => r.torrentId),
    ).toEqual(["1", "2"]);
    expect(
      filterRequests(mixed, { maxBonus: 200 }).map((r) => r.torrentId),
    ).toEqual(["1"]);
    expect(
      filterRequests(mixed, { minSize: 2000 }).map((r) => r.torrentId),
    ).toEqual(["2"]);
  });

  it("returns all rows when filters are cleared or empty", () => {
    expect(filterRequests(rows, {}).map((r) => r.torrentId)).toEqual([
      "1",
      "2",
    ]);
    expect(
      filterRequests(rows, {
        query: "",
        category: "",
        requester: "",
        minBonus: null,
        maxBonus: null,
        minSize: null,
        maxSize: null,
        fromDate: "",
        toDate: "",
      }).map((r) => r.torrentId),
    ).toEqual(["1", "2"]);
  });

  it("sorts strings ascending and descending", () => {
    const asc = sortRequests(rows, { key: "title", direction: "asc" });
    expect(asc.map((r) => r.title)).toEqual(["Movie", "Ubuntu"]);
    const desc = sortRequests(rows, { key: "title", direction: "desc" });
    expect(desc.map((r) => r.title)).toEqual(["Ubuntu", "Movie"]);
  });

  it("sorts dates descending", () => {
    const desc = sortRequests(rows, { key: "requestedAt", direction: "desc" });
    expect(desc.map((r) => r.torrentId)).toEqual(["2", "1"]);
  });

  it("compares nulls last in either direction", () => {
    const mixed = [
      { torrentId: "a", seedBonus: null },
      { torrentId: "b", seedBonus: 200 },
      { torrentId: "c", seedBonus: 100 },
    ];
    const asc = sortRequests(mixed, { key: "seedBonus", direction: "asc" });
    expect(asc.map((r) => r.torrentId)).toEqual(["c", "b", "a"]);

    const desc = sortRequests(mixed, { key: "seedBonus", direction: "desc" });
    expect(desc.map((r) => r.seedBonus)).toEqual([200, 100, null]);
  });

  describe("paginateRequests", () => {
    const list = Array.from({ length: 75 }, (_, i) => ({ id: i + 1 }));

    it("paginates with numeric page size", () => {
      const page1 = paginateRequests(list, 1, 25);
      expect(page1.items).toHaveLength(25);
      expect(page1.page).toBe(1);
      expect(page1.totalPages).toBe(3);
      expect(page1.totalItems).toBe(75);
      expect(page1.items[0].id).toBe(1);
      expect(page1.items[24].id).toBe(25);

      const page3 = paginateRequests(list, 3, 25);
      expect(page3.items).toHaveLength(25);
      expect(page3.page).toBe(3);
      expect(page3.items[0].id).toBe(51);
      expect(page3.items[24].id).toBe(75);
    });

    it("clamps page boundaries", () => {
      const clampedHigh = paginateRequests(list, 999, 25);
      expect(clampedHigh.page).toBe(3);
      expect(clampedHigh.items).toHaveLength(25);

      const clampedLow = paginateRequests(list, -5, 25);
      expect(clampedLow.page).toBe(1);
      expect(clampedLow.items).toHaveLength(25);
    });

    it("handles all page size", () => {
      const all = paginateRequests(list, 1, "all");
      expect(all.items).toHaveLength(75);
      expect(all.page).toBe(1);
      expect(all.totalPages).toBe(1);
      expect(all.totalItems).toBe(75);
    });

    it("handles empty or invalid inputs", () => {
      const empty = paginateRequests([], 1, 25);
      expect(empty.items).toHaveLength(0);
      expect(empty.page).toBe(1);
      expect(empty.totalPages).toBe(1);
      expect(empty.totalItems).toBe(0);

      const nonArray = paginateRequests(null as unknown as object[], 1, 25);
      expect(nonArray.items).toHaveLength(0);
      expect(nonArray.page).toBe(1);
    });
  });
});
