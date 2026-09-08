// Parses TorrentBD reseed request tables into normalized, filterable records.

import * as cheerio from "cheerio";

export interface ReseedRequestInput {
  torrentId: string;
  title: string;
  category: string | null;
  requester: string | null;
  seedBonus: number | null;
  seedBonusText: string | null;
  sizeBytes: number | null;
  sizeText: string | null;
  seeders: number | null;
  leechers: number | null;
  requestedAt: string | null;
  detailsUrl: string;
  details: Record<string, string>;
}

export interface ParsedReseedPage {
  requests: ReseedRequestInput[];
  nextUrl: string | null;
  recognizedEmpty: boolean;
}

const HEADER_ALIASES = {
  title: new Set(["torrent", "title"]),
  category: new Set(["category"]),
  requester: new Set(["requested by", "requester"]),
  seedBonus: new Set(["seed bonus", "bonus"]),
  size: new Set(["size"]),
  seeders: new Set(["seeders"]),
  leechers: new Set(["leechers"]),
  requestedAt: new Set(["requested", "request date", "age"]),
};

const NORMALIZED_HEADERS = new Set(
  Object.values(HEADER_ALIASES).flatMap((aliases) => [...aliases]),
);

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeHeader(text: string): string {
  return normalizeWhitespace(text).toLocaleLowerCase();
}

function parseNumber(text: string): number | null {
  const match = text.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;

  const value = Number(match[0].replaceAll(",", ""));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function parseSize(text: string): number | null {
  const match = text.match(
    /(-?\d[\d,]*(?:\.\d+)?)\s*(TiB|GiB|MiB|KiB|TB|GB|MB|KB)\b/i,
  );
  if (!match) return null;

  const value = Number(match[1].replaceAll(",", ""));
  const units: Record<string, number> = {
    KIB: 1024,
    MIB: 1024 ** 2,
    GIB: 1024 ** 3,
    TIB: 1024 ** 4,
    KB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
    TB: 1000 ** 4,
  };
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * units[match[2].toUpperCase()]);
}

function fieldForHeader(
  values: Map<string, { text: string; title: string | null }>,
  aliases: Set<string>,
): { text: string; title: string | null } | undefined {
  for (const alias of aliases) {
    const value = values.get(alias);
    if (value) return value;
  }
  return undefined;
}

function resolvePaginationUrl(
  href: string,
  baseUrl: URL,
): string {
  const target = new URL(href, baseUrl);
  if (target.origin !== baseUrl.origin) {
    throw new Error("Invalid reseed pagination origin");
  }
  if (target.pathname !== "/reseed-requests.php") {
    throw new Error("Invalid reseed pagination path");
  }
  return target.href;
}

export function parseReseedPage(
  html: string,
  baseUrl: string,
): ParsedReseedPage {
  if (html.includes("account-login.php") || html.includes("takelogin.php")) {
    throw new Error("Reseed page is a login response");
  }

  const origin = new URL(baseUrl);
  const $ = cheerio.load(html);
  const readHeaders = (element: Parameters<typeof $>[0]) =>
    $(element)
      .find("tr")
      .first()
      .find("th")
      .toArray()
      .map((cell) => {
        const label = normalizeWhitespace($(cell).text());
        return { label, normalized: normalizeHeader(label) };
      });

  const tableElement = $("table")
    .toArray()
    .find((element) => {
      const names = new Set(
        readHeaders(element).map(({ normalized }) => normalized),
      );
      const hasTitle = [...HEADER_ALIASES.title].some((name) =>
        names.has(name),
      );
      const hasBonus = [...HEADER_ALIASES.seedBonus].some((name) =>
        names.has(name),
      );
      return hasTitle && hasBonus;
    });

  if (!tableElement) {
    throw new Error("Unrecognized reseed request page");
  }

  const table = $(tableElement);
  const headers = readHeaders(tableElement);
  const requests: ReseedRequestInput[] = [];
  table.find("tr").each((_, row) => {
    const cells = $(row).find("td").toArray();
    if (cells.length === 0) return;

    const values = new Map<
      string,
      { text: string; title: string | null }
    >();
    const details: Record<string, string> = {};

    cells.forEach((cell, index) => {
      const header = headers[index];
      if (!header) return;

      const $cell = $(cell);
      const text =
        normalizeWhitespace($cell.text()) ||
        normalizeWhitespace($cell.find("[title]").first().attr("title") ?? "") ||
        normalizeWhitespace($cell.find("[alt]").first().attr("alt") ?? "");
      const title =
        $cell.attr("title") ?? $cell.find("[title]").first().attr("title");
      const value = {
        text,
        title: title ? normalizeWhitespace(title) : null,
      };
      values.set(header.normalized, value);

      if (
        header.label &&
        text &&
        !NORMALIZED_HEADERS.has(header.normalized)
      ) {
        details[header.label] = text;
      }
    });

    const detailsLink = $(row)
      .find("a[href*='torrents-details']")
      .first();
    const href = detailsLink.attr("href");
    if (!href) {
      throw new Error("Reseed request row is missing a numeric torrent ID");
    }

    const detailsUrl = new URL(href, origin);
    if (detailsUrl.origin !== origin.origin) {
      throw new Error("Invalid reseed details origin");
    }
    const torrentId = detailsUrl.searchParams.get("id") ?? "";
    if (!/^\d+$/.test(torrentId)) {
      throw new Error("Reseed request row is missing a numeric torrent ID");
    }

    const titleValue = fieldForHeader(values, HEADER_ALIASES.title)?.text;
    const title = normalizeWhitespace(detailsLink.text()) || titleValue || "";
    if (!title) {
      throw new Error(`Reseed request ${torrentId} is missing a title`);
    }

    const category = fieldForHeader(values, HEADER_ALIASES.category)?.text;
    const requester = fieldForHeader(values, HEADER_ALIASES.requester)?.text;
    const bonus = fieldForHeader(values, HEADER_ALIASES.seedBonus)?.text;
    const size = fieldForHeader(values, HEADER_ALIASES.size)?.text;
    const seeders = fieldForHeader(values, HEADER_ALIASES.seeders)?.text;
    const leechers = fieldForHeader(values, HEADER_ALIASES.leechers)?.text;
    const requested = fieldForHeader(values, HEADER_ALIASES.requestedAt);

    requests.push({
      torrentId,
      title,
      category: category || null,
      requester: requester || null,
      seedBonus: bonus ? parseNumber(bonus) : null,
      seedBonusText: bonus || null,
      sizeBytes: size ? parseSize(size) : null,
      sizeText: size || null,
      seeders: seeders ? parseNumber(seeders) : null,
      leechers: leechers ? parseNumber(leechers) : null,
      requestedAt: requested?.title || requested?.text || null,
      detailsUrl: detailsUrl.href,
      details,
    });
  });

  const relNext = $("a[rel~='next'][href]").first();
  let nextHref = relNext.attr("href") ?? null;
  if (!nextHref) {
    $("a[href]").each((_, link) => {
      if (nextHref || normalizeHeader($(link).text()) !== "next") return;
      const href = $(link).attr("href");
      if (href) nextHref = href;
    });
  }

  return {
    requests,
    nextUrl: nextHref ? resolvePaginationUrl(nextHref, origin) : null,
    recognizedEmpty: requests.length === 0,
  };
}
