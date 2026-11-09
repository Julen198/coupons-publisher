import { test } from "node:test";
import assert from "node:assert/strict";
import { clickSource, isBot, pageSource, refPath, retentionDays, uaHash, withSource } from "./click-signals.ts";

test("retentionDays: 400 days by default and never fewer; all = keep everything", () => {
  assert.equal(retentionDays(undefined), 400);
  assert.equal(retentionDays("90"), 400);
  assert.equal(retentionDays("365"), 400);
  assert.equal(retentionDays("400"), 400);
  assert.equal(retentionDays("730"), 730);
  assert.equal(retentionDays("all"), null);
  assert.equal(retentionDays("nonsense"), 400);
});

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

test("isBot: crawlers, preview fetchers, scripts and an empty user agent", () => {
  assert.equal(isBot(CHROME), false);
  for (const ua of ["Googlebot/2.1", "facebookexternalhit/1.1", "curl/8.4", "python-requests/2.31", "axios/1.6", "HeadlessChrome/120", "", null]) {
    assert.equal(isBot(ua), true, String(ua));
  }
});

test("uaHash: same browser and day → same hash, another day → another; never the raw user agent", () => {
  const a = uaHash(CHROME, "2026-11-07");
  assert.equal(a, uaHash(CHROME, "2026-11-07"));
  assert.notEqual(a, uaHash(CHROME, "2026-11-08"));
  assert.match(a, /^[0-9a-f]{16}$/);
});

test("refPath keeps only the path, without query strings or fragments", () => {
  assert.equal(refPath("https://cuponlab.es/tiendas/fnac?utm_source=x&email=a@b.c#top", "https://cuponlab.es"), "/tiendas/fnac");
  assert.equal(refPath("/chollos/42-x?y=1"), "/chollos/42-x");
  assert.equal(refPath("https://otro.es/articulo/secreto?id=1", "https://cuponlab.es"), "ext:otro.es");
  assert.equal(refPath("javascript:alert(1)"), "");
  assert.equal(refPath("//evil.example/x"), "");
  assert.equal(refPath("/<script>"), "/script");
  assert.equal(refPath(`/${"a".repeat(300)}`).length, 200);
  assert.equal(refPath(null), "");
});

test("clickSource: the link's ?o= wins, else the page path tells, else unknown", () => {
  assert.equal(clickSource("telegram", "/chollos/42-x"), "telegram");
  assert.equal(clickSource(" SEO ", ""), "seo");
  assert.equal(clickSource("<script>", "/tiendas/fnac"), "script"); // cleaned to letters/digits
  assert.equal(clickSource("123", "/tiendas/fnac"), "tienda"); // a source starts with a letter
  assert.equal(clickSource(null, "/chollos/42-x"), "chollo");
  assert.equal(clickSource(null, "/"), "portada");
  assert.equal(clickSource(null, "/p/medio/fnac"), "pagina");
  assert.equal(clickSource(null, "ext:www.medio.es"), "externo");
  assert.equal(clickSource(null, "/calendario"), "web");
  assert.equal(clickSource(null, ""), "");
});

test("withSource and pageSource", () => {
  assert.equal(withSource("/go/x/1", "tienda"), "/go/x/1?o=tienda");
  assert.equal(withSource("/go/x/1?a=1", "widget"), "/go/x/1?a=1&o=widget");
  assert.equal(withSource("/go/x/1", ""), "/go/x/1");
  assert.equal(pageSource({ utm_source: "telegram" }, "chollo"), "telegram");
  assert.equal(pageSource({ utm_source: ["a", "b"] }, "chollo"), "chollo");
  assert.equal(pageSource({}, "portada"), "portada");
});

test("countsAsReader: a jump to a store needs the page it came from; copies carry it in the beacon", async () => {
  const { countsAsReader } = await import("./click-signals.ts");
  assert.equal(countsAsReader("go", "https://www.cuponlab.com/"), true);
  assert.equal(countsAsReader("untracked", "https://diario.example/ofertas"), true);
  assert.equal(countsAsReader("go", null), false); // straight hits on /go: link checkers and crawlers that hide
  assert.equal(countsAsReader("go", "  "), false);
  assert.equal(countsAsReader("copy", null), true);
});
