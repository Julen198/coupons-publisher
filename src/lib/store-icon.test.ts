import { test } from "node:test";
import assert from "node:assert/strict";
import { iconCandidates, imageSide, manifestIcons } from "./store-icon.ts";

test("iconCandidates prefers the biggest apple-touch-icon, then big/svg icons, then the usual paths", () => {
  const html = `<link rel="icon" href="/favicon-16.png" sizes="16x16">
<link rel="apple-touch-icon" sizes="120x120" href="/touch-120.png">
<link rel="apple-touch-icon" sizes="180x180" href="https://cdn.shop.es/touch-180.png">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="icon" sizes="192x192" href="/android-192.png">`;
  assert.deepEqual(iconCandidates(html, "https://www.shop.es/es/"), [
    "https://cdn.shop.es/touch-180.png",
    "https://www.shop.es/touch-120.png",
    "https://www.shop.es/android-192.png",
    "https://www.shop.es/icon.svg",
    "https://www.shop.es/apple-touch-icon.png",
    "https://www.shop.es/favicon.ico",
  ]);
  assert.deepEqual(iconCandidates("", "https://x.es"), ["https://x.es/apple-touch-icon.png", "https://x.es/favicon.ico"]);
});

test("imageSide reads the pixel size of PNG, ICO (biggest entry), JPEG and SVG icons", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47], 0);
  png.set([0, 0, 0, 180], 16);
  assert.equal(imageSide(png, "image/png"), 180);
  const ico = new Uint8Array(6 + 32);
  ico.set([0, 0, 1, 0, 2, 0], 0);
  ico[6] = 16;
  ico[22] = 0; // 0 = 256px
  assert.equal(imageSide(ico, "image/x-icon"), 256);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 64, 0, 64]);
  assert.equal(imageSide(jpeg, "image/jpeg"), 64);
  assert.equal(imageSide(new Uint8Array(10), "image/svg+xml"), Infinity);
  assert.equal(imageSide(new Uint8Array(10), "image/webp"), 0);
});

test("manifestIcons lists a web manifest's icons, biggest first, as absolute URLs", () => {
  const json = JSON.stringify({ icons: [{ src: "fav-32.png", sizes: "32x32" }, { src: "/big-512.png", sizes: "512x512" }, { src: "javascript:x" }] });
  assert.deepEqual(manifestIcons(json, "https://www.shop.es/assets/manifest.json"), ["https://www.shop.es/big-512.png", "https://www.shop.es/assets/fav-32.png"]);
  assert.deepEqual(manifestIcons("not json", "https://x.es/m.json"), []);
});
