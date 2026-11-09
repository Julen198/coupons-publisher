import { test } from "node:test";
import assert from "node:assert/strict";
import { guideSlugs, storeGuide } from "./store-guides.ts";

test("storeGuide finds a guide by store slug, and nothing for other stores", () => {
  assert.equal(storeGuide("atmosfera-sport")?.keyword, "código descuento Atmosfera Sport");
  assert.equal(storeGuide("nike"), undefined);
});

test("every guide is complete enough to publish", () => {
  for (const slug of guideSlugs()) {
    const g = storeGuide(slug)!;
    assert.match(g.slug, /^[a-z0-9-]+$/);
    assert.ok(g.description.length >= 110 && g.description.length <= 160, `${slug}: description is ${g.description.length} chars`);
    assert.ok(g.description.toLowerCase().includes(g.keyword.toLowerCase()), `${slug}: description names the keyword`);
    assert.ok(g.sections.length >= 3 && g.faqs.length >= 3, `${slug}: sections and FAQs`);
    // FAQs feed the FAQPage JSON-LD and parseFaqs' "q | a" format: no pipes or line breaks
    for (const f of g.faqs) assert.ok(!/[|\n]/.test(f.q + f.a), `${slug}: FAQ "${f.q}"`);
  }
});
