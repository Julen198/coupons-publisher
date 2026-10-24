import { test } from "node:test";
import assert from "node:assert/strict";
import { iconCandidates } from "./store-icon.ts";

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
