// src/test/reseed-ui.test.ts
import { describe, expect, it } from "bun:test";
import { filterRequests, sortRequests } from "../reseed-ui.js";

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
    expect(filterRequests(rows, { query: "1" }).map((r) => r.torrentId)).toEqual(["1"]);
  });

  it("filters by requester in text query", () => {
    expect(filterRequests(rows, { query: "alice" }).map((r) => r.torrentId)).toEqual(["1"]);
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
    expect(filterRequests(rows, {}).map((r) => r.torrentId)).toEqual(["1", "2"]);
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
    expect(desc.map((r) => r.torrentId)).toEqual(["b", "c", "a"]);
  });
});
