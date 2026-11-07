import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseWordmark, htmlWordmarkCandidates, inlineSvgDocument, isWordmarkShape, type WordmarkSource } from "./wordmark-choice.ts";

const PAGE = "https://www.shop.es/";
const urls = (html: string) => htmlWordmarkCandidates(html, PAGE).map((c) => `${c.source} ${c.url}`);

test("htmlWordmarkCandidates: schema.org logo, og:logo, then the header's logo images in document order", () => {
  const html = `<html><head>
<meta property="og:logo" content="/og-logo.png">
<script type="application/ld+json">{"@type":"Organization","logo":{"url":"https://www.shop.es/schema-logo.svg"}}</script>
</head><body>
<header class="top">
  <img src="/flag.png" alt="España">
  <a href="/" class="site-logo"><img src="/brand.png" alt="Shop"></a>
  <img class="nav-logo-small" src="/small-logo.png">
  <img src="/x.png" alt="Logo de Shop">
</header>
<main><img src="/footer-logo.png"></main></body></html>`;
  assert.deepEqual(urls(html), [
    "schema https://www.shop.es/schema-logo.svg",
    "og:logo https://www.shop.es/og-logo.png",
    "header https://www.shop.es/brand.png",
    "header https://www.shop.es/small-logo.png",
    "header https://www.shop.es/x.png",
  ]);
});

test("htmlWordmarkCandidates: lazy images use data-src, not their placeholder; no <header> looks at the top of the body", () => {
  const html = `<body><div id="logo"><img src="data:image/gif;base64,R0lGOD" data-src="/real-logo.webp"></div></body>`;
  assert.deepEqual(urls(html), ["header https://www.shop.es/real-logo.webp"]);
});

test("htmlWordmarkCandidates: an inline <svg> logo (or one inside a logo link) becomes a standalone SVG", () => {
  const html = `<header><a class="logo" href="/" aria-label="Inicio"><svg viewBox="0 0 240 60"><path d="M0 0h240v60z"/></svg></a>
<svg class="icon-cart" viewBox="0 0 24 24"><path d="M0 0"/></svg></header>`;
  const [c, ...rest] = htmlWordmarkCandidates(html, PAGE);
  assert.equal(rest.length, 0);
  assert.equal(c.source, "header");
  assert.match(c.inlineSvg ?? "", /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 240 60">/);
});

test("htmlWordmarkCandidates: an SVG favicon is a candidate (kept only if wide), other icons are not", () => {
  const html = `<head><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" href="/favicon.png"></head>`;
  assert.deepEqual(urls(html), ["icon-svg https://www.shop.es/favicon.svg"]);
});

test("htmlWordmarkCandidates: https only, deduplicated, at most a few header images", () => {
  const imgs = Array.from({ length: 8 }, (_, i) => `<img class="logo" src="/l${i}.png">`).join("");
  const html = `<header><img class="logo" src="http://www.shop.es/plain.png"><img class="logo" src="/l0.png">${imgs}</header>`;
  assert.deepEqual(urls(html), ["header https://www.shop.es/l0.png", "header https://www.shop.es/l1.png", "header https://www.shop.es/l2.png", "header https://www.shop.es/l3.png"]);
});

test("inlineSvgDocument adds the namespace, refuses unsafe ones and sprites pointing outside themselves", () => {
  assert.equal(inlineSvgDocument(`<svg viewBox="0 0 2 1"><path d="M0 0"/></svg>`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><path d="M0 0"/></svg>`);
  assert.equal(inlineSvgDocument(`<svg viewBox="0 0 2 1"><use href="#logo-sprite"/></svg>`), null);
  assert.ok(inlineSvgDocument(`<svg viewBox="0 0 2 1"><defs><path id="a" d="M0 0"/></defs><use href="#a"/></svg>`));
  assert.equal(inlineSvgDocument(`<svg viewBox="0 0 2 1" onload="x()"></svg>`), null);
});

const d = (source: WordmarkSource, width: number, height: number, type = "image/png") => ({ url: `https://shop.es/${source}-${width}x${height}`, width, height, type, source });

test("isWordmarkShape: wide rasters (≥1.8:1, ≥120×24) of an allowed type; SVGs at least 1.5:1", () => {
  assert.equal(isWordmarkShape(d("header", 240, 60)), true);
  assert.equal(isWordmarkShape(d("header", 120, 40)), true);
  assert.equal(isWordmarkShape(d("header", 100, 30)), false, "too narrow to read");
  assert.equal(isWordmarkShape(d("header", 200, 20)), false, "too short");
  assert.equal(isWordmarkShape(d("header", 300, 200)), false, "not wide");
  assert.equal(isWordmarkShape(d("header", 240, 60, "image/gif")), false);
  assert.equal(isWordmarkShape(d("header", 30, 18, "image/svg+xml")), true);
  assert.equal(isWordmarkShape(d("icon-svg", 64, 64, "image/svg+xml")), false);
});

test("chooseWordmark prefers the first wide SVG, else the largest wide raster", () => {
  const svg = d("header", 200, 50, "image/svg+xml");
  const small = d("schema", 240, 60);
  const big = d("og:logo", 600, 150);
  assert.equal(chooseWordmark([small, big, svg]), svg);
  assert.equal(chooseWordmark([small, big, d("header", 512, 512)]), big);
  assert.equal(chooseWordmark([d("icon-svg", 64, 64, "image/svg+xml"), d("header", 300, 300)]), null);
});
