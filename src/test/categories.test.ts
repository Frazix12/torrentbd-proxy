// src/test/categories.test.ts
import { describe, it, expect } from "bun:test";
import { torznabCatsToGroups, tbdTitleToTorznabId, CATEGORIES } from "../categories";

describe("torznabCatsToGroups", () => {
  it("returns [] for undefined (search all)", () => {
    expect(torznabCatsToGroups(undefined)).toEqual([]);
  });

  it("returns [] for '0' (search all)", () => {
    expect(torznabCatsToGroups("0")).toEqual([]);
  });

  it("maps 2000 to Movies", () => {
    expect(torznabCatsToGroups("2000")).toContain("Movies");
  });

  it("maps 5000 to TV", () => {
    expect(torznabCatsToGroups("5000")).toContain("TV");
  });

  it("maps multiple cats, deduplicates groups", () => {
    const groups = torznabCatsToGroups("2040,2050");
    expect(groups.filter(g => g === "Movies").length).toBe(1);
  });

  it("maps 1000-1999 to Games", () => {
    expect(torznabCatsToGroups("1010")).toContain("Games");
  });
});

describe("tbdTitleToTorznabId", () => {
  it("maps Movies: Blu-Ray 720p to 2040", () => {
    expect(tbdTitleToTorznabId("Movies: Blu-Ray 720p")).toBe(2040);
  });

  it("maps TV: Episodes - 720p | 1080p to 5040", () => {
    expect(tbdTitleToTorznabId("TV: Episodes - 720p | 1080p")).toBe(5040);
  });

  it("returns 8000 for unknown titles", () => {
    expect(tbdTitleToTorznabId("Something Unknown")).toBe(8000);
  });
});

describe("CATEGORIES", () => {
  it("has at least 40 entries", () => {
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(40);
  });
});
