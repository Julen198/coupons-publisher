import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fetchHead, fetchOgImage, runWithBudget, type Resolve } from "./og-image-fetch.ts";

const HOME = `<html><head><meta property="og:image" content="https://cdn.shop.test/share.jpg"></head></html>`;
const PRODUCT = `<html><head><meta property="og:type" content="website"><meta property="og:image" content="https://cdn.shop.test/media/cafetera.jpg"></head><body>`;
const RELATIVE = `<html><head><meta property="og:type" content="product"><meta property="og:image" content="/media/cafetera.jpg"></head>`;
const GENERIC = `<html><head><meta property="og:image" content="https://cdn.shop.test/share.jpg"></head></html>`;

let server: Server;
let port = 0;
const seen: string[] = [];

before(async () => {
  server = createServer((req, res) => {
    seen.push(`${req.url} ${req.headers["user-agent"]}`);
    const send = (body: string, type = "text/html; charset=utf-8") => res.writeHead(200, { "content-type": type }).end(body);
    if (req.url === "/") return send(HOME);
    if (req.url === "/cafeteras/magnifica") return send(PRODUCT);
    if (req.url === "/generico") return send(GENERIC);
    if (req.url === "/relativo") return send(RELATIVE);
    if (req.url === "/viejo") return res.writeHead(301, { location: "/cafeteras/magnifica" }).end();
    if (req.url === "/al-home") return res.writeHead(302, { location: "/" }).end();
    if (req.url?.startsWith("/bucle")) return res.writeHead(302, { location: `/bucle${Number(req.url.slice(6) || 0) + 1}` }).end();
    if (req.url === "/fuera") return res.writeHead(302, { location: "http://interno.test/" }).end();
    if (req.url === "/json") return send(`{"og":"image"}`, "application/json");
    if (req.url === "/enorme") {
      res.writeHead(200, { "content-type": "text/html" });
      res.write(`<head>${"<!-- relleno -->".repeat(50_000)}`); // ~800 KB, no </head>
      return res.end(`<meta property="og:image" content="https://cdn.shop.test/tarde.jpg"></head>`);
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
});
after(() => server.close());

// shop.test points at the local server; anything else is "private" and refused, as the real resolver does
const resolve: Resolve = async (host) => {
  if (host === "shop.test") return [{ address: "127.0.0.1", family: 4 }];
  throw new Error(`blocked host ${host}`);
};
const url = (path: string) => `http://shop.test:${port}${path}`;
const quiet = () => {
  const original = console.error;
  const logged: unknown[][] = [];
  console.error = (...a: unknown[]) => void logged.push(a);
  return { logged, restore: () => (console.error = original) };
};

test("fetchOgImage takes a product page's own image, resolved, and sends our user agent", async () => {
  assert.equal(await fetchOgImage(url("/cafeteras/magnifica"), new Map(), resolve), "https://cdn.shop.test/media/cafetera.jpg");
  assert.ok(seen.some((s) => s.startsWith("/cafeteras/magnifica CuponLabBot/1.0")));
});

test("fetchOgImage: an http landing gives an https-only image, or nothing", async () => {
  // the product page's relative image resolves to http://… on an http page, so it is dropped
  assert.equal(await fetchOgImage(url("/relativo"), new Map(), resolve), null);
});

test("fetchOgImage refuses the shop's generic share picture (same as the home page) and caches the home per host", async () => {
  const cache = new Map<string, Promise<string | null>>();
  const before = seen.filter((s) => s.startsWith("/ ")).length;
  assert.equal(await fetchOgImage(url("/generico"), cache, resolve), null);
  assert.equal(await fetchOgImage(url("/generico"), cache, resolve), null);
  assert.equal(seen.filter((s) => s.startsWith("/ ")).length - before, 1);
});

test("fetchOgImage follows redirects, but a product that now redirects home has no image", async () => {
  assert.equal(await fetchOgImage(url("/al-home"), new Map(), resolve), null);
  const page = await fetchHead(url("/viejo"), resolve);
  assert.equal(page?.url, url("/cafeteras/magnifica"));
});

test("fetchHead stops after 3 redirects, at blocked hosts, and on non-HTML answers", async () => {
  const q = quiet();
  try {
    await assert.rejects(fetchHead(url("/bucle"), resolve), /redirects/);
    await assert.rejects(fetchHead(url("/fuera"), resolve), /blocked host interno\.test/);
    await assert.rejects(fetchHead(url("/json"), resolve), /not html/);
    await assert.rejects(fetchHead(url("/nada"), resolve), /404/);
  } finally {
    q.restore();
  }
});

test("fetchHead reads at most 512 KB", async () => {
  const page = await fetchHead(url("/enorme"), resolve);
  assert.ok(page && Buffer.byteLength(page.html) <= 512 * 1024, String(page?.html.length));
  assert.ok(!page.html.includes("tarde.jpg"));
});

test("fetchOgImage never fetches private addresses, tracking links, home pages or non-http URLs, and logs failures", async () => {
  const q = quiet();
  try {
    for (const u of ["http://127.0.0.1/p/1", "http://169.254.169.254/latest/meta-data/x", "http://[::1]/p/1", "http://localhost/p/1", "file:///etc/passwd", "https://www.awin1.com/cread.php?p=1", "https://shop.es/", "nope"]) {
      assert.equal(await fetchOgImage(u, new Map()), null, u);
    }
    assert.ok(q.logged.every((a) => a[0] === "[og-image]"));
    assert.ok(q.logged.some((a) => a[1] === "localhost"));
  } finally {
    q.restore();
  }
});

test("runWithBudget runs at most N at a time and starts nothing once the budget is spent", async () => {
  let running = 0;
  let peak = 0;
  let clock = 0;
  const started: number[] = [];
  const done = await runWithBudget([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], async (n) => {
    started.push(n);
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 2));
    clock += 10; // each job "takes" 10 ms of the budget
    running--;
  }, { concurrency: 4, budgetMs: 45, now: () => clock });
  assert.equal(peak, 4);
  assert.ok(started.length < 10 && started.length >= 4, String(started.length));
  assert.deepEqual(done, started);
});
