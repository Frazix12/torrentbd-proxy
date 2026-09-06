// src/categories.ts
// Maps between TorrentBD category names, Torznab category IDs, and
// TBD search group names (used in ajsearch.php torrentcats[] param).

export interface Category {
  tbdTitle: string;
  torznabId: number;
  group: string;
}

// tbdTitle matches the `title` attribute on img.cat-pic-img in TBD responses.
// TBD uses "Movies: Blu-Ray 720p" format (colon); we normalize to "Movies - Blu-Ray 720p" (dash) for lookup.
export const CATEGORIES: Category[] = [
  // Movies
  { tbdTitle: "Movies - Blu-Ray Lossless 4K",        torznabId: 2070, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray Lossless 1080p",      torznabId: 2060, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray 4K",                  torznabId: 2070, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray 1080p",               torznabId: 2050, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray 720p",                torznabId: 2040, group: "Movies" },
  { tbdTitle: "Movies - Blu-Ray SD",                  torznabId: 2030, group: "Movies" },
  { tbdTitle: "Movies - WEB-DL 4K",                  torznabId: 2070, group: "Movies" },
  { tbdTitle: "Movies - WEB-DL",                     torznabId: 2020, group: "Movies" },
  { tbdTitle: "Movies - WEBRip",                     torznabId: 2020, group: "Movies" },
  { tbdTitle: "Movies - HD-Rip",                     torznabId: 2040, group: "Movies" },
  { tbdTitle: "Movies - DVDRip",                     torznabId: 2030, group: "Movies" },
  { tbdTitle: "Movies - CAM | TS | DVDScr | Pre-DVD", torznabId: 2010, group: "Movies" },
  { tbdTitle: "Movies - 3D",                         torznabId: 2050, group: "Movies" },
  { tbdTitle: "Movies - Unrated",                    torznabId: 2000, group: "Movies" },
  { tbdTitle: "Movies - Packs",                      torznabId: 2000, group: "Movies" },
  // TV
  { tbdTitle: "TV - Episodes 4K",                    torznabId: 5070, group: "TV" },
  { tbdTitle: "TV - Episodes - 720p | 1080p",        torznabId: 5040, group: "TV" },
  { tbdTitle: "TV - Episodes SD",                    torznabId: 5030, group: "TV" },
  { tbdTitle: "TV - Packs 4K",                       torznabId: 5070, group: "TV" },
  { tbdTitle: "TV - Packs - 720p | 1080p",           torznabId: 5040, group: "TV" }, // already correct
  { tbdTitle: "TV - Packs SD",                       torznabId: 5030, group: "TV" },
  { tbdTitle: "TV - Awards | Ceremonies",            torznabId: 5000, group: "TV" },
  // Anime / Cartoons
  { tbdTitle: "Anime - All",                         torznabId: 5070, group: "Anime" },
  { tbdTitle: "Cartoons - All",                      torznabId: 5070, group: "TV" },
  // Games
  { tbdTitle: "Games - PC",                          torznabId: 1010, group: "Games" },
  { tbdTitle: "Games - Cracks | Patches",            torznabId: 1010, group: "Games" },
  { tbdTitle: "Games - Updates | DLC",               torznabId: 1010, group: "Games" },
  { tbdTitle: "Games - Backup",                      torznabId: 1010, group: "Games" },
  { tbdTitle: "Games - PlayStation",                 torznabId: 1040, group: "Games" },
  { tbdTitle: "Games - Xbox",                        torznabId: 1050, group: "Games" },
  { tbdTitle: "Games - Other",                       torznabId: 1000, group: "Games" },
  // Apps
  { tbdTitle: "Apps - PC",                           torznabId: 4010, group: "Apps" },
  { tbdTitle: "Apps - Mac",                          torznabId: 4020, group: "Apps" },
  { tbdTitle: "Apps - Linux",                        torznabId: 4030, group: "Apps" },
  { tbdTitle: "Apps - Android",                      torznabId: 4040, group: "Apps" },
  // Music
  { tbdTitle: "Music - Audio",                       torznabId: 3000, group: "Music" },
  { tbdTitle: "Music - Lossless",                    torznabId: 3040, group: "Music" },
  { tbdTitle: "Music - Video",                       torznabId: 3020, group: "Music" },
  { tbdTitle: "Music - Concerts | Live Shows",       torznabId: 3020, group: "Music" },
  { tbdTitle: "Music - Radio",                       torznabId: 3000, group: "Music" },
  // Books
  { tbdTitle: "Other - E-Books",                     torznabId: 7020, group: "Books" },
  { tbdTitle: "E-Books - Comics",                    torznabId: 7030, group: "Books" },
  { tbdTitle: "E-Books - Manga",                     torznabId: 7030, group: "Books" },
  // Sports
  { tbdTitle: "Sports - Football",                   torznabId: 5060, group: "Sports" },
  { tbdTitle: "Sports - Pro Wrestling",              torznabId: 5060, group: "Sports" },
  { tbdTitle: "Sports - All",                        torznabId: 5060, group: "Sports" },
  // Documentaries
  { tbdTitle: "Documentaries - All",                 torznabId: 5002, group: "Documentaries" },
  // Other
  { tbdTitle: "Tutorials - All",                     torznabId: 7000, group: "Tutorials" },
  { tbdTitle: "Other - Mobile Phone",                torznabId: 4040, group: "Other" },
  { tbdTitle: "Other - Religious",                   torznabId: 7000, group: "Other" },
  { tbdTitle: "Other - Miscellaneous",               torznabId: 7000, group: "Other" },
];

// Normalizes TBD's img title attribute to match CATEGORIES entries.
// TBD uses "Movies: Blu-Ray 720p" (colon); CATEGORIES use "Movies - Blu-Ray 720p" (dash).
function normalizeTbdTitle(title: string): string {
  return title.replace(/^([^:]+):\s+/, "$1 - ");
}

// Given a TBD img title attr (e.g. "Movies: Blu-Ray 720p"),
// returns the matching Torznab category ID. Falls back to 8000 (Other).
export function tbdTitleToTorznabId(title: string): number {
  const normalized = normalizeTbdTitle(title);
  return CATEGORIES.find(c => c.tbdTitle === normalized)?.torznabId ?? 8000;
}

// Maps Torznab category IDs to TBD group names for ajsearch.php.
// Range-based: 2000-2999 → Movies, 5000-5059 → TV, etc.
export function torznabCatsToGroups(cats: string | undefined): string[] {
  if (!cats || cats === "0") return [];
  const ids = cats.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
  const groups = new Set<string>();
  for (const id of ids) {
    if (id >= 2000 && id <= 2999) groups.add("Movies");
    else if (id >= 5000 && id <= 5059) groups.add("TV");
    else if (id === 5060) groups.add("Sports");
    else if (id >= 5070 && id <= 5079) groups.add("Anime");
    else if (id >= 1000 && id <= 1999) groups.add("Games");
    else if (id >= 4000 && id <= 4999) groups.add("Apps");
    else if (id >= 3000 && id <= 3999) groups.add("Music");
    else if (id >= 7000 && id <= 7999) groups.add("Books");
    else if (id === 5002) groups.add("Documentaries");
  }
  return [...groups];
}
