import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Resolve } from "./og-image-fetch.ts";
import { downloadWordmark, fetchWordmark } from "./wordmark-fetch.ts";

const png = (w: number, h: number) => {
  const b = Buffer.alloc(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
const WIDE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80"><path d="M0 0h300v80z"/></svg>`;

let server: Server;
let port = 0;
before(async () => {
  server = createServer((req, res) => {
    const host = (req.headers.host ?? "").split(":")[0];
    const send = (body: string | Buffer, type: string, status = 200) => res.writeHead(status, { "content-type": type }).end(body);
    const path = `${host}${req.url}`;
    if (path === "raster.test/")
      return send(`<header><img class="logo" src="/square.png"><a class="logo" href="/"><img src="/small.png"></a><img src="/big-logo.png"></header>`, "text/html");
    if (path === "raster.test/square.png") return send(png(300, 300), "image/png");
    if (path === "raster.test/small.png") return send(png(240, 60), "image/png");
    if (path === "raster.test/big-logo.png") return send(png(800, 200), "image/png");
    if (path === "svg.test/")
      return send(`<header><img class="logo" src="/wide.png"><a href="/" id="logo"><svg viewBox="0 0 200 50"><path d="M0 0h200v50z"/></svg></a></header>`, "text/html");
    if (path === "svg.test/wide.png") return send(png(800, 200), "image/png");
    if (path === "file.test/logo.svg") return send(WIDE_SVG, "image/svg+xml");
    if (path === "blocked.test/") return send("Forbidden", "text/html", 403);
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
});
after(() => server.close());

const resolve: Resolve = async (host) => {
  if (/\.test$/.test(host)) return [{ address: "127.0.0.1", family: 4 }];
  throw new Error(`blocked host ${host}`);
};
const at = (host: string, path = "/") => `http://${host}:${port}${path}`;
const opts = { resolve, allowHttp: true };

test("fetchWordmark takes the largest wide raster from the header and lists square ones as not wide", async () => {
  const { wordmark, tried } = await fetchWordmark(at("raster.test"), opts);
  assert.equal(wordmark?.url, at("raster.test", "/big-logo.png"));
  assert.equal(wordmark?.source, "header");
  assert.match(wordmark?.dataUri ?? "", /^data:image\/png;base64,/);
  assert.ok(tried.some((t) => t.result === "300x300 image/png · not wide"));
});

test("fetchWordmark prefers an inline SVG logo to any raster", async () => {
  const { wordmark } = await fetchWordmark(at("svg.test"), opts);
  assert.equal(wordmark?.type, "image/svg+xml");
  assert.deepEqual([wordmark?.width, wordmark?.height], [200, 50]);
  assert.match(Buffer.from((wordmark?.dataUri ?? "").split(",")[1], "base64").toString(), /^<svg xmlns=/);
});

test("fetchWordmark reports a blocked home page; downloadWordmark fetches a hand-picked file", async () => {
  const blocked = await fetchWordmark(at("blocked.test"), opts);
  assert.equal(blocked.wordmark, null);
  assert.match(blocked.tried[0].result, /HTTP 403/);
  const manual = await downloadWordmark(at("file.test", "/logo.svg"), "manual", opts);
  assert.deepEqual([manual.source, manual.width, manual.height], ["manual", 300, 80]);
});
