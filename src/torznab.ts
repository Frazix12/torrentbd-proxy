// src/torznab.ts
// Builds Torznab-compliant XML responses for Prowlarr.
// Torznab spec: http://torznab.com/schemas/2015/feed

import { CATEGORIES } from "./categories";
import type { TorrentItem } from "./parser";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toRfc2822(date: Date): string {
  return date.toUTCString();
}

// Build the category tree for caps XML, deduplicated by parent ID.
function buildCategoryElements(): string {
  const parents = new Map<number, Set<number>>();
  const parentNames = new Map<number, string>([
    [1000, "PC/Games"],
    [2000, "Movies"],
    [3000, "Audio"],
    [4000, "PC"],
    [5000, "TV"],
    [7000, "Books"],
    [8000, "Other"],
  ]);

  for (const cat of CATEGORIES) {
    const parentId = Math.floor(cat.torznabId / 1000) * 1000;
    if (!parents.has(parentId)) parents.set(parentId, new Set());
    parents.get(parentId)!.add(cat.torznabId);
  }

  return [...parents.entries()]
    .sort(([a], [b]) => a - b)
    .map(([parentId, subIds]) => {
      const subcats = [...subIds]
        .filter((id) => id !== parentId)
        .sort()
        .map((id) => {
          const cat = CATEGORIES.find((c) => c.torznabId === id);
          return `    <subcat id="${id}" name="${xmlEscape(cat?.tbdTitle ?? String(id))}"/>`;
        })
        .join("\n");
      return `  <category id="${parentId}" name="${xmlEscape(parentNames.get(parentId) ?? String(parentId))}">\n${subcats}\n  </category>`;
    })
    .join("\n");
}

export function buildCapsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server title="TorrentBD Proxy"/>
  <limits max="100" default="100"/>
  <searching>
    <search available="yes" supportedParams="q"/>
    <tv-search available="yes" supportedParams="q,season,ep"/>
    <movie-search available="yes" supportedParams="q"/>
    <music-search available="yes" supportedParams="q"/>
    <book-search available="yes" supportedParams="q"/>
  </searching>
  <categories>
${buildCategoryElements()}
  </categories>
</caps>`;
}

export function buildSearchXml(
  items: TorrentItem[],
  proxyBaseUrl: string,
  apiKey: string,
): string {
  const itemsXml = items
    .map((item) => {
      const guid = `https://www.torrentbd.net/torrents-details.php?id=${item.id}`;
      const dlUrl = `${proxyBaseUrl}/download?id=${item.id}&apikey=${apiKey}`;
      const peers = item.seeders + item.leechers;

      return `    <item>
      <title>${xmlEscape(item.title)}</title>
      <guid>${xmlEscape(guid)}</guid>
      <link>${xmlEscape(dlUrl)}</link>
      <pubDate>${toRfc2822(item.publishDate)}</pubDate>
      <torznab:attr name="category" value="${item.torznabCategoryId}"/>
      <torznab:attr name="size" value="${item.sizeBytes}"/>
      <torznab:attr name="seeders" value="${item.seeders}"/>
      <torznab:attr name="peers" value="${peers}"/>
      <torznab:attr name="grabs" value="${item.grabs}"/>
      <torznab:attr name="downloadvolumefactor" value="${item.freeleech ? 0 : 1}"/>
      <torznab:attr name="uploadvolumefactor" value="1"/>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <title>TorrentBD</title>
${itemsXml}
  </channel>
</rss>`;
}

export function buildErrorXml(code: number, description: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<error code="${code}" description="${xmlEscape(description)}"/>`;
}
