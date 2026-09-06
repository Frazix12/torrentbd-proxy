// src/test/torznab.test.ts
import { describe, it, expect } from "bun:test";
import { buildCapsXml, buildSearchXml, buildErrorXml } from "../torznab";
import type { TorrentItem } from "../parser";

const SAMPLE_ITEM: TorrentItem = {
  id: "1279583",
  title: "End of Days 1999 720p BluRay",
  torznabCategoryId: 2040,
  sizeBytes: 9481369067,
  seeders: 5,
  leechers: 2,
  grabs: 7,
  publishDate: new Date("2025-09-24T20:42:00Z"),
  freeleech: true,
  downloadPath: "download.php?id=1279583",
};

describe("buildCapsXml", () => {
  it("returns valid XML with caps element", () => {
    const xml = buildCapsXml();
    expect(xml).toContain("<caps>");
    expect(xml).toContain("</caps>");
  });

  it("includes searching element", () => {
    expect(buildCapsXml()).toContain("<searching>");
  });

  it("includes movie-search", () => {
    expect(buildCapsXml()).toContain("movie-search");
  });

  it("includes categories", () => {
    expect(buildCapsXml()).toContain("<categories>");
  });

  it("includes Movies category id 2000", () => {
    expect(buildCapsXml()).toContain('id="2000"');
  });
});

describe("buildSearchXml", () => {
  it("returns RSS XML", () => {
    const xml = buildSearchXml([SAMPLE_ITEM], "http://proxy:5000", "key");
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("</rss>");
  });

  it("includes torrent title", () => {
    const xml = buildSearchXml([SAMPLE_ITEM], "http://proxy:5000", "key");
    expect(xml).toContain("End of Days 1999 720p BluRay");
  });

  it("includes proxy download link", () => {
    const xml = buildSearchXml([SAMPLE_ITEM], "http://proxy:5000", "key");
    expect(xml).toContain("http://proxy:5000/download?id=1279583");
    expect(xml).toContain("apikey=key");
  });

  it("includes size in bytes", () => {
    const xml = buildSearchXml([SAMPLE_ITEM], "http://proxy:5000", "key");
    expect(xml).toContain("9481369067");
  });

  it("sets downloadvolumefactor to 0 for freeleech", () => {
    const xml = buildSearchXml([SAMPLE_ITEM], "http://proxy:5000", "key");
    expect(xml).toContain('name="downloadvolumefactor" value="0"');
  });

  it("returns empty channel for no items", () => {
    const xml = buildSearchXml([], "http://proxy:5000", "key");
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });
});

describe("buildErrorXml", () => {
  it("returns error XML with code and description", () => {
    const xml = buildErrorXml(100, "Something went wrong");
    expect(xml).toContain("error");
    expect(xml).toContain("100");
    expect(xml).toContain("Something went wrong");
  });
});
