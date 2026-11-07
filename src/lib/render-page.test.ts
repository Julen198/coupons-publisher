import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPage } from "./render-page.ts";

const client = { id: 1, name: "Diario <Demo>", slug: "diario-demo", domain: "", awin_affiliate_id: "123", clickref_prefix: "demo", brand_color: "#0b4f8a", logo_url: "", nav_items: "", font_style: "serif" as const, font_family: "", layout: "newspaper" as const };
const store = { id: 2, name: "adidas", slug: "adidas", website: "https://www.adidas.es", merchant_id: "77008", network: "awin", tracking_url: "", publisher_id: "", intro: "", faqs: "", category: "" as const, facts: "", has_logo: false, country: "", country_source: "" as const };
const coupon = { id: 9, store_id: 2, kind: "code" as const, title: "Cupón", code: "SAVE10", discount: "10€", description: "", target_url: "https://www.adidas.es/x", expires_at: "", verified: 1, archived: 0, source: "manual" as const, source_url: "", external_id: null, publisher_id: "", shared_by: null, review: "" as const, about: "", about_status: "" as const };
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

test("cards show the store's icon when it has one and we know our origin", () => {
  const html = renderPage(client, { ...store, has_logo: true }, [coupon], NOW, undefined, "https://demo.example");
  assert.match(html, /<img class="cp-logo" src="https:\/\/demo\.example\/store-logo\/adidas" alt="adidas"/);
  assert.doesNotMatch(renderPage(client, store, [coupon], NOW, undefined, "https://demo.example"), /cp-logo"/);
});

test("client without an Awin id: the link carries the publisher id of the account that imported the coupon", () => {
  const html = renderPage({ ...client, awin_affiliate_id: "" }, { ...store, publisher_id: "555" }, [{ ...coupon, publisher_id: "888" }], NOW);
  assert.match(html, /awinmid=77008&amp;awinaffid=888&amp;clickref=demo-adidas-9/);
});

test("client without an Awin id, manual coupon: falls back to the publisher id that joined the store", () => {
  const html = renderPage({ ...client, awin_affiliate_id: "" }, { ...store, publisher_id: "555" }, [coupon], NOW);
  assert.match(html, /awinaffid=555&amp;/);
});

test("the client's own Awin id wins over our publisher ids", () => {
  const html = renderPage(client, { ...store, publisher_id: "555" }, [{ ...coupon, publisher_id: "888" }], NOW);
  assert.match(html, /awinaffid=123&amp;/);
});

test("no Awin id anywhere: straight to the store", () => {
  const html = renderPage({ ...client, awin_affiliate_id: "" }, store, [coupon], NOW);
  assert.doesNotMatch(html, /awin1\.com/);
  assert.match(html, /href="https:\/\/www\.adidas\.es\/x"/);
});

test("other networks: the client's own account link wins over ours", async () => {
  const { couponAffiliateUrl } = await import("./render-page.ts");
  const td = { ...store, network: "tradedoubler", tracking_url: "https://ours/?epi={ref}&url={url}" };
  assert.match(couponAffiliateUrl(client, td, coupon), /^https:\/\/ours\//);
  assert.equal(couponAffiliateUrl(client, td, coupon, "https://theirs/?epi={ref}&url={url}"),
    "https://theirs/?epi=demo-adidas-9&url=https%3A%2F%2Fwww.adidas.es%2Fx");
});
