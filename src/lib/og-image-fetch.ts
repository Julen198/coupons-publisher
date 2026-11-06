// Server only: reads a landing page's <head> to find its product photo (og:image).
// Every hop is resolved and checked first, and the connection is pinned to the checked addresses,
// so a page can't point us at internal services (SSRF), not even by changing DNS between check and fetch.
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { extractOgImage, isBlockedAddress, isProductImage, isTrackingLink } from "./og-image.ts";

export interface Address {
  address: string;
  family: number;
}
export type Resolve = (host: string) => Promise<Address[]>;

const TIMEOUT_MS = 5_000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const HEADERS = {
  "User-Agent": "CuponLabBot/1.0 (+https://coupons-publisher-demo.vercel.app/metodologia)",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
  "Accept-Language": "es-ES,es;q=0.9",
  "Accept-Encoding": "identity",
};

// Public addresses only; throws when the host has none or any of them is private
export const publicAddresses: Resolve = async (host) => {
  const bare = host.replace(/^\[|\]$/g, "");
  const found = isIP(bare) ? [{ address: bare, family: isIP(bare) }] : await lookup(bare, { all: true });
  if (!found.length || found.some((a) => isBlockedAddress(a.address))) throw new Error("blocked address");
  return found;
};

const pinned = (addresses: Address[]): LookupFunction => (_host, options, done) => {
  if (options.all) done(null, addresses);
  else done(null, addresses[0].address, addresses[0].family);
};

type Hop = { redirect: string } | { html: string };

function getOnce(url: URL, addresses: Address[], signal: AbortSignal): Promise<Hop> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(url, { method: "GET", headers: HEADERS, lookup: pinned(addresses), signal }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: res.headers.location });
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${status}`));
      }
      if (!/html/i.test(res.headers["content-type"] ?? "")) {
        res.resume();
        return reject(new Error("not html"));
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        res.destroy();
        resolve({ html: Buffer.concat(chunks).subarray(0, MAX_BYTES).toString("utf8") });
      };
      res.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        bytes += chunk.length;
        // "</head>" may straddle two chunks: look at this one plus the end of the previous
        if (bytes >= MAX_BYTES || /<\/head>/i.test(Buffer.concat(chunks.slice(-2)).toString("latin1"))) finish();
      });
      res.on("end", finish);
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

// The page's head (up to 512 KB) and the address it was finally read from
export async function fetchHead(start: string, resolve: Resolve = publicAddresses): Promise<{ html: string; url: string }> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https?:$/.test(url.protocol)) throw new Error(`protocol ${url.protocol}`);
    if (isTrackingLink(url.href)) throw new Error("tracking link");
    const res = await getOnce(url, await resolve(url.hostname), signal);
    if ("html" in res) return { html: res.html, url: url.href };
    url = new URL(res.redirect, url);
  }
  throw new Error("too many redirects");
}

const isRoot = (u: URL) => u.pathname.replace(/\/+$/, "") === "";

// The product photo on a landing page, or null. The shop's home image (to tell its generic share picture apart)
// is read once per host per run, through the cache the caller keeps.
export async function fetchOgImage(landingUrl: string, homeImageCache: Map<string, Promise<string | null>>, resolve: Resolve = publicAddresses): Promise<string | null> {
  if (!URL.canParse(landingUrl)) return null;
  const landing = new URL(landingUrl);
  if (!/^https?:$/.test(landing.protocol) || isRoot(landing) || isTrackingLink(landing.href)) return null;
  try {
    const page = await fetchHead(landing.href, resolve);
    const og = extractOgImage(page.html, page.url);
    if (!og || isRoot(new URL(page.url))) return null;
    const origin = new URL(page.url).origin;
    if (!homeImageCache.has(origin)) {
      homeImageCache.set(origin, fetchHead(`${origin}/`, resolve).then((h) => extractOgImage(h.html, h.url)?.image ?? null, () => null));
    }
    const homeImage = await homeImageCache.get(origin)!;
    return isProductImage(og, page.url, homeImage) ? og.image : null;
  } catch (e) {
    console.error("[og-image]", landing.hostname, e instanceof Error ? e.message : String(e));
    return null;
  }
}

export interface BudgetOptions {
  concurrency: number;
  budgetMs: number;
  now?: () => number;
}

// Runs `work` over the items, `concurrency` at a time, starting no new item once `budgetMs` have passed.
// Returns the items that were started (and finished); the rest wait for the next run.
export async function runWithBudget<T>(items: readonly T[], work: (item: T) => Promise<void>, { concurrency, budgetMs, now = Date.now }: BudgetOptions): Promise<T[]> {
  const deadline = now() + budgetMs;
  const started: T[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length && now() < deadline) {
      const item = items[next++];
      started.push(item);
      await work(item);
    }
  }));
  return started;
}
