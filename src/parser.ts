// src/parser.ts
// Parses TorrentBD HTML responses into structured TorrentItem objects.
// Uses cheerio for DOM traversal. Selectors confirmed from HAR analysis.

import * as cheerio from "cheerio";
import { tbdTitleToTorznabId } from "./categories";

export interface TorrentItem {
  id: string;
  title: string;
  torznabCategoryId: number;
  sizeBytes: number;
  seeders: number;
  leechers: number;
  grabs: number;
  publishDate: Date;
  freeleech: boolean;
  downloadPath: string;
}

// Parses "8.83 GiB", "1.23 GB", "512 MB" etc. to bytes.
function parseSize(text: string): number {
  const clean = text.replace(/[^\d.A-Za-z]/g, " ").trim();
  const match = clean.match(/([\d.]+)\s*(TiB|GiB|MiB|KiB|TB|GB|MB|KB)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const units: Record<string, number> = {
    KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4,
    KB: 1000, MB: 1000 ** 2, GB: 1000 ** 3, TB: 1000 ** 4,
  };
  return Math.round(num * (units[unit] ?? 0));
}

// Extracts integer from text containing a material-icon + number.
function parseCount(text: string): number {
  const match = text.replace(/[^\d]/g, " ").trim().match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// Extracts torrent ID from href like "torrents-details.php?id=1279583&hit=1"
function extractId(href: string): string {
  return new URLSearchParams(href.split("?")[1] ?? "").get("id") ?? "";
}

// Normalizes download href to "download.php?id=X"
function extractDownloadPath(href: string): string {
  const match = href.match(/download\.php\?id=(\d+)/);
  return match ? `download.php?id=${match[1]}` : href;
}

// Parses a date string like "2025-09-24 08:42 PM" to a Date.
function parseDate(dateStr: string): Date {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

// Parses ajsearch.php HTML (table.kuddus-torrents-table) → TorrentItem[]
export function parseSearchResults(html: string): TorrentItem[] {
  const $ = cheerio.load(html);
  const items: TorrentItem[] = [];

  $("table.kuddus-torrents-table tr").each((_, row) => {
    const $row = $(row);

    const catTitle = $row.find("img.cat-pic-img").attr("title") ?? "";
    const titleEl = $row.find("a.ttorr-title");
    const title = titleEl.text().trim();
    const detailHref = titleEl.attr("href") ?? "";
    const id = extractId(detailHref);
    if (!id || !title) return; // skip malformed rows

    const sizeText = $row.find(".blue100[title='File Size']").text();
    const seeders = parseCount($row.find(".thc.seed").text());
    const leechers = parseCount($row.find(".thc.leech").text());
    const grabs = parseCount($row.find(".thc.completed").text());
    const dateStr = $row.find(".uploaded-by span[title]").attr("title") ?? "";
    const freeleech = $row.find('img[src*="free.gif"]').length > 0;
    const dlHref = $row.find('a[href*="download.php"]').attr("href") ?? "";

    items.push({
      id,
      title,
      torznabCategoryId: tbdTitleToTorznabId(catTitle),
      sizeBytes: parseSize(sizeText),
      seeders,
      leechers,
      grabs,
      publishDate: parseDate(dateStr),
      freeleech,
      downloadPath: extractDownloadPath(dlHref),
    });
  });

  return items;
}

// Parses ajgettorrents.php HTML (table.torrents-table) → TorrentItem[]
export function parseBrowseResults(html: string): TorrentItem[] {
  const $ = cheerio.load(html);
  const items: TorrentItem[] = [];

  $("table.torrents-table > tbody > tr").each((_, row) => {
    const $row = $(row);

    const catTitle = $row.find("img.cat-pic-img").attr("title") ?? "";
    const titleEl = $row.find("td.torrent-name a[href*='torrents-details']");
    const title = titleEl.text().trim();
    const detailHref = titleEl.attr("href") ?? "";
    const id = extractId(detailHref);
    if (!id || !title) return;

    const sizeText = $row.find("td:nth-child(6)").text().trim();
    const seeders = parseInt($row.find("td:nth-child(7)").text().trim(), 10) || 0;
    const leechers = parseInt($row.find("td:nth-child(8)").text().trim(), 10) || 0;
    const grabs = parseInt($row.find("td:nth-child(9)").text().trim(), 10) || 0;
    const dateStr = $row.find(".torrent-added-on").attr("title") ?? "";
    const freeleech = $row.find('img[src*="free.gif"]').length > 0;
    const dlHref = $row.find('a[href*="download.php"]').attr("href") ?? "";

    items.push({
      id,
      title,
      torznabCategoryId: tbdTitleToTorznabId(catTitle),
      sizeBytes: parseSize(sizeText),
      seeders,
      leechers,
      grabs,
      publishDate: parseDate(dateStr),
      freeleech,
      downloadPath: extractDownloadPath(dlHref),
    });
  });

  return items;
}
