// Pixel size of an image from its first bytes: PNG, JPEG, WebP, GIF, ICO (its biggest entry) or SVG
// (width/height attributes, else the viewBox). null when the bytes don't say.

export interface Size {
  width: number;
  height: number;
}

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const valid = (s: Size): Size | null => (s.width > 0 && s.height > 0 ? s : null);

function png(b: Uint8Array): Size | null {
  if (b.length < 24 || b[0] !== 0x89 || ascii(b, 1, 3) !== "PNG") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return valid({ width: v.getUint32(16), height: v.getUint32(20) });
}

// Start-of-frame markers (C0-CF but DHT C4, JPG C8, DAC CC) carry height then width
function jpeg(b: Uint8Array): Size | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 8 < b.length && b[i] === 0xff; i += 2 + u16be(b, i + 2)) {
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return valid({ width: u16be(b, i + 7), height: u16be(b, i + 5) });
  }
  return null;
}

function webp(b: Uint8Array): Size | null {
  if (b.length < 25 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const kind = ascii(b, 12, 4);
  if (kind === "VP8 ") return valid({ width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff });
  if (kind === "VP8L") {
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return valid({ width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 });
  }
  if (kind === "VP8X") return valid({ width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 });
  return null;
}

function gif(b: Uint8Array): Size | null {
  return b.length >= 10 && ascii(b, 0, 3) === "GIF" ? valid({ width: u16le(b, 6), height: u16le(b, 8) }) : null;
}

function ico(b: Uint8Array): Size | null {
  if (b.length < 22 || b[0] !== 0 || b[1] !== 0 || b[2] !== 1 || b[3] !== 0) return null;
  const sizes = Array.from({ length: u16le(b, 4) }, (_, k) => 6 + 16 * k)
    .filter((at) => at + 1 < b.length)
    .map((at) => ({ width: b[at] || 256, height: b[at + 1] || 256 }));
  return sizes.sort((x, y) => y.width * y.height - x.width * x.height)[0] ?? null;
}

function svg(b: Uint8Array): Size | null {
  const tag = /<svg\b[^>]*>/i.exec(new TextDecoder().decode(b.subarray(0, 64 * 1024)))?.[0];
  if (!tag) return null;
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1].trim();
  const px = (v: string | undefined) => (v && /^\d+(\.\d+)?(px)?$/.test(v) ? parseFloat(v) : 0);
  const [width, height] = [px(attr("width")), px(attr("height"))];
  if (width && height) return { width, height };
  const box = (attr("viewBox") ?? "").split(/[\s,]+/).map(Number);
  return box.length === 4 && box.every(Number.isFinite) ? valid({ width: box[2], height: box[3] }) : null;
}

export function imageSize(bytes: Uint8Array, type: string): Size | null {
  if (/svg/i.test(type)) return svg(bytes);
  return png(bytes) ?? jpeg(bytes) ?? webp(bytes) ?? gif(bytes) ?? ico(bytes);
}

// The format the bytes really are ("" when none of ours): headers can lie, and an image route must not serve HTML
export function sniffImageType(b: Uint8Array): string {
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  if (ascii(b, 0, 3) === "GIF") return "image/gif";
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return "image/x-icon";
  const text = new TextDecoder().decode(b.subarray(0, 4096)).replace(/^﻿/, "");
  return /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg\b/i.test(text) ? "image/svg+xml" : "";
}
