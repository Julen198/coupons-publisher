import { test } from "node:test";
import assert from "node:assert/strict";
import { redirectPage, safeTarget } from "./redirect-page.ts";

const base = { url: "https://www.awin1.com/cread.php?awinmid=1&p=x", storeName: "Decathlon", storeSlug: "decathlon", hasLogo: true, code: "VERANO15", expired: false, expiredOn: "" };

test("a live coupon jumps to the tracked link and shows the code", () => {
  const html = redirectPage(base);
  assert.match(html, /http-equiv="refresh" content="1;url=https:\/\/www\.awin1\.com\/cread\.php\?awinmid=1&amp;p=x"/);
  assert.match(html, /location\.replace\(u\)/);
  // the meta refresh is only for no-JS browsers, so a JS browser navigates once
  assert.match(html, /<noscript><meta http-equiv="refresh"/);
  assert.match(html, /<b>VERANO15<\/b>/);
  assert.match(html, /Cómo usarlo/);
  assert.match(html, /noindex/);
});

test("a deal without code says no code is needed and skips the steps", () => {
  const html = redirectPage({ ...base, code: "" });
  assert.match(html, /No necesitas código/);
  assert.doesNotMatch(html, /Cómo usarlo/);
});

test("an expired coupon never jumps on its own", () => {
  const html = redirectPage({ ...base, expired: true, expiredOn: "31 de octubre" });
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.doesNotMatch(html, /location\.replace/);
  assert.match(html, /Caducó el 31 de octubre/);
  assert.match(html, /href="\/tiendas\/decathlon"/);
});

test("store data is escaped and a non-http target goes home", () => {
  const html = redirectPage({ ...base, storeName: `<script>x</script>`, code: `"><img>`, url: "javascript:alert(1)" });
  assert.doesNotMatch(html, /<script>x<\/script>/);
  assert.doesNotMatch(html, /"><img>/);
  assert.doesNotMatch(html, /javascript:alert/);
  assert.equal(safeTarget("javascript:alert(1)"), "/");
  assert.equal(safeTarget("HTTPS://x.es"), "HTTPS://x.es");
});

test("a link with </script> can't close the inline script", () => {
  const html = redirectPage({ ...base, url: "https://x.es/?a=</script><b>" });
  assert.doesNotMatch(html, /a=<\/script>/);
});
