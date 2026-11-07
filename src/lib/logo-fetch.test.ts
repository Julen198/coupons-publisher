import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Resolve } from "./og-image-fetch.ts";
import { downloadLogo, fetchLogo, placeholderHashes } from "./logo-fetch.ts";

const png = (w: number, h = w, pad = 0) => {
  const b = Buffer.alloc(33 + pad);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
const GLOBE = png(16, 16, 7);

const HOME = `<html><head>
<link rel="icon" href="/favicon-16.png" sizes="16x16">
<link rel="apple-touch-icon" sizes="180x180" href="/touch.png">
<link rel="manifest" href="/m.json">
</head><body>`;
const MANIFEST = JSON.stringify({ icons: [{ src: "/a-192.png", sizes: "192x192" }, { src: "/a-512.png", sizes: "512x512" }] });
const BAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"/>`;
const GOOD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M0 0h64v64z"/></svg>`;

let server: Server;
let port = 0;
before(async () => {
  server = createServer((req, res) => {
    const host = (req.headers.host ?? "").split(":")[0];
    const send = (body: string | Buffer, type: string, status = 200) => res.writeHead(status, { "content-type": type }).end(body);
    const path = `${host}${req.url}`;
    if (path === "shop.test/") return send(HOME, "text/html");
    if (path === "shop.test/m.json") return send(MANIFEST, "application/manifest+json");
    if (path === "shop.test/a-512.png") return send(png(512), "image/png");
    if (path === "shop.test/a-192.png") return send(png(192), "image/png");
    if (path === "shop.test/touch.png") return send(png(180), "image/png");
    if (path === "shop.test/favicon-16.png") return send(png(16), "image/png");
    if (path === "svg.test/") return send(`<link rel="icon" href="/bad.svg"><link rel="icon" href="/good.svg">`, "text/html");
    if (path === "svg.test/bad.svg") return send(BAD_SVG, "image/svg+xml");
    if (path === "svg.test/good.svg") return send(GOOD_SVG, "image/svg+xml");
    if (path === "big.test/huge.png") return send(png(1024, 1024, 310_000), "image/png");
    if (path === "big.test/lying.png") return send(Buffer.from("<html>no</html>"), "image/png");
    if (path === "big.test/icon.ico") return send(Buffer.from([0, 0, 1, 0, 1, 0, 0, 0, ...Array(30).fill(0)]), "image/x-icon");
    if (req.url?.startsWith("/s2?domain=no-such-domain")) return send(GLOBE, "image/png", 404);
    if (req.url?.startsWith("/s2?domain=globe.test")) return send(GLOBE, "image/png");
    if (req.url?.startsWith("/s2?domain=google.test")) return send(png(256), "image/png");
    if (path === "google.test/") return send(`<link rel="icon" href="/f.png" sizes="16x16">`, "text/html");
    if (path === "google.test/f.png") return send(png(16), "image/png");
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
});
after(() => server.close());

const resolve: Resolve = async (host) => {
  if (/\.test$/.test(host) || host === "goog.local") return [{ address: "127.0.0.1", family: 4 }];
  throw new Error(`blocked host ${host}`);
};
// The tests' server speaks http on a random port; production is https only
const at = (host: string, path = "/") => `http://${host}:${port}${path}`;
const opts = () => ({
  resolve,
  allowHttp: true,
  googleFavicon: (host: string) => `http://goog.local:${port}/s2?domain=${host}`,
});

test("fetchLogo takes the manifest's biggest icon, with its real size, as a data URI", async () => {
  const { logo } = await fetchLogo(at("shop.test"), opts());
  assert.equal(logo?.source, "manifest");
  assert.equal(logo?.url, `http://shop.test:${port}/a-512.png`);
  assert.deepEqual([logo?.width, logo?.height, logo?.type], [512, 512, "image/png"]);
  assert.equal(logo?.dataUri, `data:image/png;base64,${png(512).toString("base64")}`);
});

test("fetchLogo rejects SVGs with event handlers and keeps clean ones", async () => {
  const { logo, tried } = await fetchLogo(at("svg.test"), opts());
  assert.equal(logo?.url, `http://svg.test:${port}/good.svg`);
  assert.equal(logo?.type, "image/svg+xml");
  assert.match(tried.find((t) => t.url.endsWith("/bad.svg"))?.result ?? "", /unsafe svg/);
});

test("fetchLogo uses Google's favicon only when big, and never its placeholder globe", async () => {
  const placeholders = await placeholderHashes(opts());
  assert.equal(placeholders.size, 1);
  assert.equal((await fetchLogo(at("google.test"), { ...opts(), placeholders })).logo?.source, "google");
  assert.equal((await fetchLogo(at("globe.test"), { ...opts(), placeholders })).logo, null);
});

test("downloadLogo refuses files over 300 KB, bytes that aren't what they claim, and ICOs", async () => {
  await assert.rejects(downloadLogo(at("big.test", "/huge.png"), "icon", opts()), /too big/);
  await assert.rejects(downloadLogo(at("big.test", "/lying.png"), "icon", opts()), /not a png/);
  await assert.rejects(downloadLogo(at("big.test", "/icon.ico"), "icon", opts()), /not an allowed image/);
});

test("fetchLogo refuses non-https websites and private hosts", async () => {
  assert.equal((await fetchLogo("ftp://shop.test/", opts())).logo, null);
  const strict = await fetchLogo(at("shop.test"), { ...opts(), allowHttp: false, googleFavicon: (h: string) => `https://goog.local:${port}/s2?domain=${h}` });
  assert.equal(strict.logo, null);
  assert.ok(strict.tried.length > 0 && strict.tried.every((t) => !t.url.startsWith("http:")), "an http website is tried as https");
  const { logo, tried } = await fetchLogo("https://intranet.local/", { ...opts(), googleFavicon: (h: string) => `https://intranet.local/g?${h}` });
  assert.equal(logo, null);
  assert.ok(tried.every((t) => /blocked host/.test(t.result)));
});
