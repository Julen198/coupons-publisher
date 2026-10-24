import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPage } from "./render-page.ts";

const client = { id: 1, name: "Diario <Demo>", slug: "diario-demo", domain: "", awin_affiliate_id: "123", clickref_prefix: "demo", brand_color: "#0b4f8a", logo_url: "", nav_items: "", font_style: "serif" as const, font_family: "", layout: "newspaper" as const };
const store = { id: 2, name: "adidas", slug: "adidas", website: "https://www.adidas.es", awin_merchant_id: "77008", network: "awin", tracking_url: "", intro: "", faqs: "", has_logo: false };
const coupon = { id: 9, store_id: 2, kind: "code" as const, title: "Cupón", code: "SAVE10", discount: "10€", description: "", target_url: "https://www.adidas.es/x", expires_at: "", verified: 1, archived: 0, source: "manual" as const, source_url: "", awin_offer_id: null };
const NOW = new Date(2026, 9, 24);

test("with trackBase, buttons go through /go for click counting", () => {
  const html = renderPage(client, store, [coupon], NOW, "https://demo.example");
  assert.match(html, /href="https:\/\/demo\.example\/go\/diario-demo\/9"/);
  assert.doesNotMatch(html, /awin1\.com/);
});

test("without trackBase, buttons link straight to Awin with the client's clickref", () => {
  const html = renderPage(client, store, [coupon], NOW);
  assert.match(html, /awin1\.com\/cread\.php\?awinmid=77008&amp;awinaffid=123&amp;clickref=demo-adidas-9/);
});

test("client name is escaped in the disclosure", () => {
  assert.match(renderPage(client, store, [coupon], NOW), /Diario &lt;Demo&gt; puede recibir/);
});

test("the module uses the client's web font when known", () => {
  const html = renderPage({ ...client, font_family: "Montserrat" }, store, [], new Date("2026-10-01"));
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Montserrat:/);
  assert.match(html, /font-family:'Montserrat',/);
  assert.doesNotMatch(renderPage(client, store, [], new Date("2026-10-01")), /fonts\.googleapis/);
});
