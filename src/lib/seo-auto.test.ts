import { test } from "node:test";
import assert from "node:assert/strict";
import { INDEXNOW_KEY, indexNowRequest, llmsTxt, relatedGuides, type GuideLink } from "./seo-auto.ts";

const g = (slug: string, category: string, at = "2026-11-01"): GuideLink => ({
  slug, name: slug.toUpperCase(), keyword: `código descuento ${slug}`, description: `Guía de ${slug}`, category, updatedAt: new Date(`${at}T10:00:00Z`),
});

test("relatedGuides: other guides, same category first, then the most recent, capped", () => {
  const all = [g("aosom", "hogar", "2026-11-09"), g("ikea", "hogar", "2026-10-01"), g("nike", "deporte", "2026-11-08"), g("adidas", "deporte", "2026-11-05"), g("zara", "moda", "2026-11-07")];
  assert.deepEqual(relatedGuides(all, "nike", "deporte", 3).map((x) => x.slug), ["adidas", "aosom", "zara"]);
  assert.deepEqual(relatedGuides(all, "aosom", "hogar", 2).map((x) => x.slug), ["ikea", "nike"]);
  assert.deepEqual(relatedGuides([g("solo", "hogar")], "solo", "hogar", 4), []);
});

test("indexNowRequest: the IndexNow body for our host, its key file and the changed URLs", () => {
  const req = indexNowRequest("https://www.cuponlab.com", ["/tiendas/aosom", "/"]);
  assert.equal(req.url, "https://api.indexnow.org/indexnow");
  assert.deepEqual(req.body, {
    host: "www.cuponlab.com",
    key: INDEXNOW_KEY,
    keyLocation: "https://www.cuponlab.com/indexnow.txt",
    urlList: ["https://www.cuponlab.com/tiendas/aosom", "https://www.cuponlab.com/"],
  });
  assert.match(INDEXNOW_KEY, /^[0-9a-f]{32}$/);
});

test("llmsTxt: a plain index of the site for AI assistants, guides with their one-line description", () => {
  const txt = llmsTxt("https://www.cuponlab.com", [g("aosom", "hogar")], [{ slug: "nike", name: "Nike", live: 6 }]);
  assert.match(txt, /^# CuponLab\n\n> /);
  assert.match(txt, /## Guías de tiendas\n\n- \[Código descuento aosom\]\(https:\/\/www\.cuponlab\.com\/tiendas\/aosom\): Guía de aosom/);
  assert.match(txt, /## Tiendas con más cupones\n\n- \[Nike\]\(https:\/\/www\.cuponlab\.com\/tiendas\/nike\): 6 cupones activos/);
  assert.match(txt, /metodologia/);
});
