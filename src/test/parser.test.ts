// src/test/parser.test.ts
import { describe, it, expect } from "bun:test";
import { parseSearchResults, parseBrowseResults } from "../parser";

// Minimal realistic HTML confirmed from HAR analysis
const SEARCH_HTML = `
<h6 class="kuddus-results-counter">&#x1F50D; 14134</h6>
<table class="kuddus-torrents-table">
  <tr>
    <td><img class="cat-pic-img" src="images/categories/v3/i_movies_720p.png" title="Movies: Blu-Ray 720p"></td>
    <td>
      <div class="mb-7 block">
        <a href="torrents-details.php?id=1279583&hit=1" class="ttorr-title">End of Days 1999 720p BluRay DD5.1 x264</a>
        <img class="rel-icon" src="images/free.gif" alt="FL" title="FreeLeech">
      </div>
      <div class="blue100 inline-block" title="File Size"><i class="material-icons">insert_drive_file</i> 8.83 GiB</div>
      <div class="uploaded-by inline-block">Uploaded by <a href="#">User</a>,
        <span title="2025-09-24 08:42 PM">11mo ago</span>
      </div>
      <div>
        <div class="thc seed inline" title="Seeders online"><i class="material-icons">file_upload</i> 5</div>
        <div class="thc leech inline" title="Leechers"><i class="material-icons">file_download</i> 2</div>
        <div class="thc completed inline" title="Total completed"><i class="material-icons">done_all</i> 7</div>
      </div>
    </td>
    <td><a href="download.php?id=1279583"><i class="material-icons small">file_download</i></a></td>
  </tr>
</table>
`;

const BROWSE_HTML = `
<table class="torrents-table">
  <tbody>
    <tr>
      <td class="tab-sortable hide-on-small-only" onclick="mtt.getSpCatTorrents(10)">
        <img class="cat-pic-img" src="images/categories/v3/i_games_pc_3.png" title="Games: PC">
      </td>
      <td class="torrent-name">
        <span class="dl-sc-trg fx" data-type="torrent" data-tid="1326862">
          <a href="torrents-details.php?id=1326862&hit=1">Forza Horizon 5 Ultimate Edition</a>
        </span>
        <img src="images/free.gif" alt="FL" title="FreeLeech">
        <span class="torrent-added-on" title="2026-08-08 06:06 PM">29d ago</span>
      </td>
      <td><a href="https://www.torrentbd.net/download.php?id=1326862"><i class="material-icons small">file_download</i></a></td>
      <td></td>
      <td></td>
      <td>12.5 GB</td>
      <td>3</td>
      <td>1</td>
      <td>42</td>
    </tr>
  </tbody>
</table>
`;

describe("parseSearchResults", () => {
  it("returns one item from minimal HTML", () => {
    expect(parseSearchResults(SEARCH_HTML).length).toBe(1);
  });

  it("extracts id", () => {
    expect(parseSearchResults(SEARCH_HTML)[0].id).toBe("1279583");
  });

  it("extracts title", () => {
    expect(parseSearchResults(SEARCH_HTML)[0].title).toBe(
      "End of Days 1999 720p BluRay DD5.1 x264",
    );
  });

  it("maps category to torznab ID (Movies: Blu-Ray 720p → 2040)", () => {
    expect(parseSearchResults(SEARCH_HTML)[0].torznabCategoryId).toBe(2040);
  });

  it("parses size to bytes", () => {
    const expected = Math.round(8.83 * 1024 ** 3);
    const actual = parseSearchResults(SEARCH_HTML)[0].sizeBytes;
    expect(Math.abs(actual - expected)).toBeLessThan(1000);
  });

  it("parses seeders and leechers", () => {
    const item = parseSearchResults(SEARCH_HTML)[0];
    expect(item.seeders).toBe(5);
    expect(item.leechers).toBe(2);
  });

  it("detects freeleech", () => {
    expect(parseSearchResults(SEARCH_HTML)[0].freeleech).toBe(true);
  });

  it("extracts download path", () => {
    expect(parseSearchResults(SEARCH_HTML)[0].downloadPath).toContain(
      "1279583",
    );
  });

  it("returns empty array for empty HTML", () => {
    expect(parseSearchResults("<html></html>")).toEqual([]);
  });
});

describe("parseBrowseResults", () => {
  it("returns one item", () => {
    expect(parseBrowseResults(BROWSE_HTML).length).toBe(1);
  });

  it("extracts id from browse", () => {
    expect(parseBrowseResults(BROWSE_HTML)[0].id).toBe("1326862");
  });

  it("extracts seeders from column", () => {
    expect(parseBrowseResults(BROWSE_HTML)[0].seeders).toBe(3);
  });
});
