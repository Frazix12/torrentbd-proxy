// src/cache.ts
// Simple in-memory TTL cache for Torznab XML search results.
// Keyed by "${query}|${cats}|${page}". No background cleanup — TTL checked on read.

import { config } from "./config";

interface Entry {
  value: string;
  expiresAt: number;
}

const store = new Map<string, Entry>();

export const cache = {
  get(key: string): string | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  },

  set(key: string, value: string): void {
    store.set(key, {
      value,
      expiresAt: Date.now() + config.cacheTtlSeconds * 1000,
    });
  },
};
