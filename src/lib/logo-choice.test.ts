import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseLogo, htmlLogoCandidates, isBetterLogo, isUnsafeSvg, manifestLogoCandidates, type LogoCandidate } from "./logo-choice.ts";

const c = (source: LogoCandidate["source"], width: number, height = width, type = "image/png", extra: Partial<LogoCandidate> = {}): LogoCandidate => ({
  url: `https://shop.es/${source}-${width}x${height}.${type.split("/")[1]}`,
  width,
  height,
  type,
  source,
  ...extra,
});

test("chooseLogo takes the first source in order that has a big square-ish logo, the largest there", () => {
  const touch = c("apple-touch-icon", 180);
  const m192 = c("manifest", 192);
  const m512 = c("manifest", 512);
  assert.equal(chooseLogo([touch, m192, m512, c("google", 256)]), m512);
  assert.equal(chooseLogo([c("icon", 192), touch]), touch);
  assert.equal(chooseLogo([c("og:logo", 400), c("icon", 128)])?.source, "icon");
  assert.equal(chooseLogo([c("google", 256), c("schema", 300)])?.source, "schema");
});

test("chooseLogo: an SVG counts as big, at any declared size", () => {
  const svg = c("icon", 16, 16, "image/svg+xml");
  assert.equal(chooseLogo([svg, c("og:logo", 512)]), svg);
});

test("chooseLogo skips non-square logos while a square one is big enough, and falls back to them", () => {
  const wordmark = c("schema", 172, 45);
  assert.equal(chooseLogo([wordmark, c("google", 256)])?.source, "google");
  assert.equal(chooseLogo([wordmark, c("icon", 16)]), wordmark); // Atmosfera: favicon + wordmark only
  // without a big square one: a mid-size square icon beats a wordmark
  assert.equal(chooseLogo([wordmark, c("apple-touch-icon", 96)])?.source, "apple-touch-icon");
});

test("chooseLogo rejects tiny logos, small Google answers, odd types and placeholders", () => {
  assert.equal(chooseLogo([c("manifest", 48), c("icon", 32)]), null);
  assert.equal(chooseLogo([c("google", 64)]), null);
  assert.equal(chooseLogo([c("icon", 256, 256, "image/x-icon"), c("icon", 256, 256, "image/gif")]), null);
  const globe = c("google", 256, 256, "image/png", { sha256: "abc" });
  assert.equal(chooseLogo([globe], new Set(["abc"])), null);
  assert.equal(chooseLogo([globe, c("icon", 80)], new Set(["abc"]))?.source, "icon");
});

test("htmlLogoCandidates lists touch icons, sized icons, og:logo and schema.org logos, plus the manifest", () => {
  const html = `<head>
<link rel="icon" href="/favicon-16.png" sizes="16x16">
<link rel="apple-touch-icon" sizes="180x180" href="https://cdn.shop.es/touch-180.png">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:logo" content="/brand/logo.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"Organization","logo":{"@type":"ImageObject","url":"https:\\/\\/media.shop.es\\/img\\/logo.png"}}]}</script>
<script type="application/ld+json">{"@type":"WebSite","publisher":{"@type":["Store","Organization"],"logo":"/l2.png"}}</script>
<script type="application/ld+json">not json</script>
</head>`;
  const { candidates, manifestUrl } = htmlLogoCandidates(html, "https://www.shop.es/es/");
  assert.equal(manifestUrl, "https://www.shop.es/site.webmanifest");
  assert.deepEqual(
    candidates.map((x) => [x.source, x.url, x.width]),
    [
      ["apple-touch-icon", "https://cdn.shop.es/touch-180.png", 180],
      ["icon", "https://www.shop.es/favicon-16.png", 16],
      ["icon", "https://www.shop.es/icon.svg", 0],
      ["og:logo", "https://www.shop.es/brand/logo.png", 0],
      ["schema", "https://media.shop.es/img/logo.png", 0],
      ["schema", "https://www.shop.es/l2.png", 0],
      ["apple-touch-icon", "https://www.shop.es/apple-touch-icon.png", 0],
    ],
  );
});

test("htmlLogoCandidates keeps https URLs only", () => {
  const html = `<link rel="apple-touch-icon" href="http://shop.es/t.png"><link rel="icon" href="data:image/png;base64,AA"><link rel="icon" href="javascript:alert(1)">`;
  assert.deepEqual(htmlLogoCandidates(html, "https://shop.es/").candidates.map((x) => x.url), ["https://shop.es/apple-touch-icon.png"]);
});

test("manifestLogoCandidates reads a manifest's icons with their sizes, skipping monochrome ones", () => {
  const json = JSON.stringify({
    icons: [
      { src: "fav-32.png", sizes: "32x32", type: "image/png" },
      { src: "/big-512.png", sizes: "192x192 512x512" },
      { src: "/mono.png", sizes: "512x512", purpose: "monochrome" },
      { src: "javascript:x" },
    ],
  });
  assert.deepEqual(
    manifestLogoCandidates(json, "https://www.shop.es/assets/manifest.json").map((x) => [x.url, x.width, x.type]),
    [
      ["https://www.shop.es/assets/fav-32.png", 32, "image/png"],
      ["https://www.shop.es/big-512.png", 512, ""],
    ],
  );
  assert.deepEqual(manifestLogoCandidates("nope", "https://x.es/m.json"), []);
});

test("isUnsafeSvg flags scripts, foreignObject, event handlers, entities and outside references", () => {
  assert.equal(isUnsafeSvg(`<svg viewBox="0 0 10 10"><path d="M0 0" fill="#0a0"/><use href="#a"/></svg>`), false);
  for (const bad of [
    `<svg><script>alert(1)</script></svg>`,
    `<svg><foreignObject><div/></foreignObject></svg>`,
    `<svg onload="x()"></svg>`,
    `<svg><a href="javascript:x">`,
    `<!DOCTYPE svg [<!ENTITY x "y">]><svg/>`,
    `<svg><image href="https://evil.test/a.png"/></svg>`,
    `<svg><use xlink:href="other.svg#a"/></svg>`,
    `<html><body>not an svg</body></html>`,
  ]) {
    assert.equal(isUnsafeSvg(bad), true, bad);
  }
});

test("isBetterLogo: a proposal replaces the current logo only when it is bigger", () => {
  const small = { width: 16, height: 16, type: "image/png" };
  const wordmark = { width: 172, height: 45, type: "image/png" };
  assert.equal(isBetterLogo(null, wordmark), true);
  assert.equal(isBetterLogo(small, wordmark), true);
  assert.equal(isBetterLogo(wordmark, small), false);
  assert.equal(isBetterLogo({ width: 180, height: 180, type: "image/png" }, { width: 180, height: 180, type: "image/png" }), false);
  assert.equal(isBetterLogo({ width: 512, height: 512, type: "image/png" }, { width: 24, height: 24, type: "image/svg+xml" }), true);
  assert.equal(isBetterLogo({ width: 24, height: 24, type: "image/svg+xml" }, { width: 512, height: 512, type: "image/png" }), false);
});
