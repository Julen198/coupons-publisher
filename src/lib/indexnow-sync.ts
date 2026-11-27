// Which pages to tell IndexNow about (Bing, Yandex, Seznam…; Bing's index is what ChatGPT search and Copilot read).
// Pure: the hourly cron (indexnow-cron.ts) builds each sitemap page's fingerprint, compares it with what it sent last
// time and pings only the pages that are new, changed or gone. The first run sends the whole sitemap.
import { createHash } from "node:crypto";

export interface PageSig { path: string; sig: string }

// A short fingerprint of whatever a page shows that matters to a search engine
export const fingerprint = (parts: readonly unknown[]): string => createHash("md5").update(JSON.stringify(parts)).digest("hex").slice(0, 16);

// IndexNow takes up to 10,000 URLs per request
export const INDEXNOW_MAX_URLS = 10_000;

// New or changed pages, and pages that left the sitemap (sent too, so the engine recrawls them and drops them)
export function pagesToPing(current: readonly PageSig[], previous: ReadonlyMap<string, string>): { changed: string[]; gone: string[] } {
  const now = new Map(current.map((p) => [p.path, p.sig]));
  const changed = [...now].filter(([path, sig]) => previous.get(path) !== sig).map(([path]) => path);
  const gone = [...previous.keys()].filter((path) => !now.has(path));
  return { changed, gone };
}

// The URLs of one ping, at most INDEXNOW_MAX_URLS: the home page first, then the rest in sitemap order, gone ones last
export function pingBatch(changed: readonly string[], gone: readonly string[]): string[] {
  const all = [...new Set([...changed.filter((p) => p === "/"), ...changed, ...gone])];
  return all.slice(0, INDEXNOW_MAX_URLS);
}
