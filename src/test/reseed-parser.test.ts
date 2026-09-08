import { describe, expect, it } from "bun:test";
import { parseReseedPage } from "../reseed-parser";

const page = `
<table class="reseed-list">
  <thead><tr>
    <th>Torrent</th><th>Category</th><th>Requested By</th>
    <th>Seed Bonus</th><th>Size</th><th>Seeders</th>
    <th>Leechers</th><th>Requested</th><th>Reason</th>
  </tr></thead>
  <tbody><tr>
    <td><a href="/torrents-details.php?id=42">Ubuntu Archive</a></td>
    <td>Software</td><td>Alice</td><td>1,500 points</td>
    <td>2.5 GiB</td><td>0</td><td>3</td><td>2026-09-07</td>
    <td>Please reseed</td>
  </tr></tbody>
</table>
<a rel="next" href="/reseed-requests.php?page=2">Next</a>`;

describe("parseReseedPage", () => {
  it("normalizes filter fields and preserves every visible column", () => {
    const result = parseReseedPage(page, "https://www.torrentbd.net");
    expect(result.requests).toEqual([
      expect.objectContaining({
        torrentId: "42",
        title: "Ubuntu Archive",
        category: "Software",
        requester: "Alice",
        seedBonus: 1500,
        seedBonusText: "1,500 points",
        sizeBytes: 2684354560,
        sizeText: "2.5 GiB",
        seeders: 0,
        leechers: 3,
        requestedAt: "2026-09-07",
        detailsUrl:
          "https://www.torrentbd.net/torrents-details.php?id=42",
        details: { Reason: "Please reseed" },
      }),
    ]);
    expect(result.nextUrl).toBe(
      "https://www.torrentbd.net/reseed-requests.php?page=2",
    );
  });

  it("recognizes a valid empty table", () => {
    const html = `<table><thead><tr><th>Torrent</th><th>Seed Bonus</th></tr></thead><tbody></tbody></table>`;
    expect(parseReseedPage(html, "https://www.torrentbd.net")).toEqual({
      requests: [],
      nextUrl: null,
      recognizedEmpty: true,
    });
  });

  it("rejects login and unrelated HTML", () => {
    expect(() =>
      parseReseedPage(
        `<form action="takelogin.php"></form>`,
        "https://www.torrentbd.net",
      ),
    ).toThrow();
    expect(() =>
      parseReseedPage(`<h1>Maintenance</h1>`, "https://www.torrentbd.net"),
    ).toThrow();
  });

  it("rejects pagination outside the configured origin", () => {
    const html = page.replace(
      "/reseed-requests.php?page=2",
      "https://evil.example/page=2",
    );
    expect(() =>
      parseReseedPage(html, "https://www.torrentbd.net"),
    ).toThrow("pagination origin");
  });

  it("uses the requested cell title and recognizes header aliases", () => {
    const html = `
      <table>
        <tr><th>Title</th><th>Bonus</th><th>Requester</th><th>Age</th></tr>
        <tr>
          <td><a href="torrents-details.php?id=99&hit=1">Archive</a></td>
          <td>250</td><td>Bob</td><td><span title="2026-09-01 09:30 PM">7d ago</span></td>
        </tr>
      </table>`;
    const request = parseReseedPage(
      html,
      "https://www.torrentbd.net",
    ).requests[0];
    expect(request).toEqual(
      expect.objectContaining({
        torrentId: "99",
        requester: "Bob",
        seedBonus: 250,
        requestedAt: "2026-09-01 09:30 PM",
      }),
    );
  });

  it("finds a textual next-page link", () => {
    const html = page
      .replace('rel="next" ', "")
      .replace(">Next<", ">  Next  <");
    expect(parseReseedPage(html, "https://www.torrentbd.net").nextUrl).toBe(
      "https://www.torrentbd.net/reseed-requests.php?page=2",
    );
  });

  it("rejects a data row without a numeric torrent id", () => {
    const html = page.replace("?id=42", "?id=invalid");
    expect(() =>
      parseReseedPage(html, "https://www.torrentbd.net"),
    ).toThrow("numeric torrent ID");
  });

  it("rejects torrent details links outside the configured origin", () => {
    const html = page.replace(
      "/torrents-details.php?id=42",
      "https://evil.example/torrents-details.php?id=42",
    );
    expect(() =>
      parseReseedPage(html, "https://www.torrentbd.net"),
    ).toThrow("details origin");
  });
});
