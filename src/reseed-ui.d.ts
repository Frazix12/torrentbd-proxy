// src/reseed-ui.d.ts
export interface ReseedFilterOptions {
  query?: string | null;
  category?: string | null;
  requester?: string | null;
  minBonus?: number | null;
  maxBonus?: number | null;
  minSize?: number | null;
  maxSize?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
}

export interface ReseedSortOptions {
  key?: string;
  direction?: "asc" | "desc";
}

export interface ReseedRowItem {
  torrentId: string;
  title?: string;
  category?: string | null;
  requester?: string | null;
  seedBonus?: number | null;
  seedBonusText?: string | null;
  sizeBytes?: number | null;
  sizeText?: string | null;
  seeders?: number | null;
  leechers?: number | null;
  requestedAt?: string | null;
  detailsUrl?: string;
  details?: Record<string, string>;
  [key: string]: unknown;
}

export function filterRequests<T extends ReseedRowItem>(
  requests: T[],
  filters: ReseedFilterOptions,
): T[];

export function sortRequests<T extends ReseedRowItem>(
  requests: T[],
  sort: ReseedSortOptions,
): T[];

export interface ReseedPaginationResult<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
}

export function paginateRequests<T>(
  requests: T[],
  page?: number,
  pageSize?: number | string,
): ReseedPaginationResult<T>;
