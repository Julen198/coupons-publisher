import { test } from "node:test";
import assert from "node:assert/strict";
import { imageSize } from "./image-size.ts";

const png = (w: number, h: number) => {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
const enc = (s: string) => new TextEncoder().encode(s);

test("imageSize reads PNG width and height", () => {
  assert.deepEqual(imageSize(png(180, 120), "image/png"), { width: 180, height: 120 });
});

test("imageSize reads JPEG from its SOF segment (skipping others)", () => {
  // SOI, APP0 (len 4), SOF2: len 11, precision 8, height 0x0040, width 0x0050
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc2, 0, 11, 8, 0, 0x40, 0, 0x50]);
  assert.deepEqual(imageSize(jpeg, "image/jpeg"), { width: 80, height: 64 });
});

test("imageSize reads the three WebP flavours", () => {
  const head = (kind: string) => [...enc("RIFF"), 0, 0, 0, 0, ...enc("WEBP"), ...enc(kind), 0, 0, 0, 0];
  const lossy = Uint8Array.from([...head("VP8 "), 0, 0, 0, 0x9d, 0x01, 0x2a, 200, 0, 100, 0]);
  assert.deepEqual(imageSize(lossy, "image/webp"), { width: 200, height: 100 });
  // VP8L: signature 0x2f, then 14 bits width-1, 14 bits height-1 (LE). 256x128 → 255, 127
  const bits = 255 | (127 << 14);
  const lossless = Uint8Array.from([...head("VP8L"), 0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >> 24) & 255]);
  assert.deepEqual(imageSize(lossless, "image/webp"), { width: 256, height: 128 });
  // VP8X: flags + 3 reserved, then 24-bit width-1 and height-1. 512x512
  const extended = Uint8Array.from([...head("VP8X"), 0, 0, 0, 0, 255, 1, 0, 255, 1, 0]);
  assert.deepEqual(imageSize(extended, "image/webp"), { width: 512, height: 512 });
});

test("imageSize reads an ICO's biggest entry (0 = 256) and GIF", () => {
  const ico = new Uint8Array(6 + 32);
  ico.set([0, 0, 1, 0, 2, 0], 0);
  ico.set([16, 16], 6);
  ico.set([0, 0], 22);
  assert.deepEqual(imageSize(ico, "image/x-icon"), { width: 256, height: 256 });
  const gif = Uint8Array.from([...enc("GIF89a"), 32, 0, 16, 0]);
  assert.deepEqual(imageSize(gif, "image/gif"), { width: 32, height: 16 });
});

test("imageSize reads an SVG's width/height, else its viewBox; null when it has neither", () => {
  assert.deepEqual(imageSize(enc(`<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="40">`), "image/svg+xml"), { width: 120, height: 40 });
  assert.deepEqual(imageSize(enc(`<?xml version="1.0"?><svg width="100%" viewBox="0 0 24 24.5">`), "image/svg+xml"), { width: 24, height: 24.5 });
  assert.equal(imageSize(enc(`<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>`), "image/svg+xml"), null);
});

test("imageSize gives null for truncated or unknown bytes", () => {
  assert.equal(imageSize(new Uint8Array(10), "image/png"), null);
  assert.equal(imageSize(Uint8Array.from([0xff, 0xd8, 0xff]), "image/jpeg"), null);
  assert.equal(imageSize(enc("hello"), "text/plain"), null);
});

test("sniffImageType tells the format from the bytes, not the header", async () => {
  const { sniffImageType } = await import("./image-size.ts");
  assert.equal(sniffImageType(png(1, 1)), "image/png");
  assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImageType(enc("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(sniffImageType(enc("GIF89a")), "image/gif");
  assert.equal(sniffImageType(Uint8Array.from([0, 0, 1, 0, 1, 0])), "image/x-icon");
  assert.equal(sniffImageType(enc(`﻿<?xml version="1.0"?>\n<!-- x --><svg viewBox="0 0 1 1"/>`)), "image/svg+xml");
  assert.equal(sniffImageType(enc("<html>")), "");
});
