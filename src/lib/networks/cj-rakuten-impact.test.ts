import { test } from "node:test";
import assert from "node:assert/strict";
import { mapLink, parseLinks, trackingTemplate as cjTemplate } from "./cj.ts";
import { mapCoupon, parseCoupons, trackingTemplate as rakutenTemplate } from "./rakuten.ts";
import { activeContract, impact, mapCampaign, mapDeal } from "./impact.ts";
import { decodeXml, elements, text } from "./xml.ts";
import { trackingUrl } from "../affiliate.ts";

test("xml helpers: records, entities, CDATA and self-closing tags", () => {
  const xml = `<r><link><a>Tom &amp; Jerry</a><b><![CDATA[<i>10%</i> off]]></b><c/></link><link><a>&#233;</a></link></r>`;
  const links = elements(xml, "link");
  assert.equal(links.length, 2);
  assert.equal(text(links[0], "a"), "Tom & Jerry");
  assert.equal(text(links[0], "c"), "");
  assert.equal(text(links[1], "a"), "é");
  assert.equal(decodeXml("<![CDATA[x]]>"), "x");
});

const cjXml = `<?xml version="1.0"?><cj-api><links total-matched="1" records-returned="1" page-number="1"><link>
  <advertiser-id>1234</advertiser-id><advertiser-name>Shop ES</advertiser-name><link-id>987</link-id>
  <link-name>15% con el código CJ15</link-name><description>Solo web</description><coupon-code>CJ15</coupon-code>
  <promotion-type>coupon</promotion-type><promotion-end-date>2026-12-31 23:59:59.0</promotion-end-date>
  <destination>https://www.shop.es/rebajas</destination><clickUrl>https://www.anrdoezrs.net/click-555-987</clickUrl>
  <targeted-countries>ES, PT</targeted-countries></link></links></cj-api>`;

test("CJ link search → code offer, click link template with sid and url", () => {
  const { links, total } = parseLinks(cjXml);
  assert.equal(total, 1);
  assert.deepEqual(mapLink(links[0]), {
    id: "987", advertiserId: "1234", kind: "code", title: "15% con el código CJ15", code: "CJ15", discount: "15%",
    description: "Solo web", url: "https://www.shop.es/rebajas", expires: "2026-12-31",
  });
  assert.equal(mapLink({ ...links[0], countries: "US" }), null);
  assert.equal(
    trackingUrl(cjTemplate(links[0].clickUrl), "https://shop.es/a", "medio-shop-1"),
    "https://www.anrdoezrs.net/click-555-987?sid=medio-shop-1&url=https%3A%2F%2Fshop.es%2Fa",
  );
  assert.equal(cjTemplate("https://example.com/whatever"), "");
});

test("Rakuten coupon feed → offers keyed by offerid, deeplink keeps the encrypted id", () => {
  const xml = `<couponfeed><TotalMatches>1</TotalMatches><TotalPages>1</TotalPages><link type="TEXT">
    <promotiontypes><promotiontype id="11">Free Shipping</promotiontype></promotiontypes>
    <offerdescription>Envío gratis en todo</offerdescription><offerenddate>2026-11-30</offerenddate><couponcode></couponcode>
    <couponrestriction>Pedidos +30€</couponrestriction><clickurl>https://click.linksynergy.com/fs-bin/click?id=AbC*1&amp;offerid=777.42&amp;type=3</clickurl>
    <advertiserid>4321</advertiserid><advertisername>Tienda</advertisername></link></couponfeed>`;
  const { coupons, pages } = parseCoupons(xml);
  assert.equal(pages, 1);
  const o = mapCoupon(coupons[0], "https://tienda.es");
  assert.deepEqual([o.id, o.kind, o.discount, o.description, o.url, o.expires], ["777.42", "deal", "Envío gratis", "Pedidos +30€", "https://tienda.es", "2026-11-30"]);
  assert.equal(
    trackingUrl(rakutenTemplate(coupons[0].clickUrl, "4321"), "https://tienda.es/x", "m-t-1"),
    "https://click.linksynergy.com/deeplink?id=AbC*1&mid=4321&u1=m-t-1&murl=https%3A%2F%2Ftienda.es%2Fx",
  );
});

test("Impact campaign deep link and deals: percent/amount badges, expired dropped", () => {
  const camp = { CampaignId: "9", CampaignName: "Marca", CampaignUrl: "https://marca.es/", TrackingLink: "https://marca.sjv.io/c/1/2/9", AllowDeeplinking: "true" };
  assert.equal(mapCampaign(camp).trackingTemplate, "https://marca.sjv.io/c/1/2/9?subId1={ref}&u={url}");
  assert.equal(mapCampaign({ ...camp, AllowDeeplinking: "false" }).trackingTemplate, "https://marca.sjv.io/c/1/2/9?subId1={ref}");
  const deal = { Id: "5", Name: "Rebajas", CampaignId: "9", State: "ACTIVE", DefaultPromoCode: "IMP10", DiscountPercent: "10", EndDate: "2026-12-01T00:00:00-08:00" };
  assert.deepEqual(mapDeal(deal, "https://marca.es"), {
    id: "5", advertiserId: "9", kind: "code", title: "Rebajas", code: "IMP10", discount: "10%", description: "", url: "https://marca.es", expires: "2026-12-01",
  });
  assert.equal(mapDeal({ ...deal, DiscountPercent: "", DiscountAmount: "5", DiscountCurrency: "EUR" })?.discount, "5€");
  assert.equal(mapDeal({ ...deal, State: "EXPIRED" }), null);
});

test("Impact deal: its own Uri is the deep link when it is a valid http(s) address, else the campaign's site", () => {
  const deal = { Id: "5", Name: "Rebajas", CampaignId: "9", State: "ACTIVE" };
  assert.equal(mapDeal({ ...deal, Uri: "https://www.marca.es/rebajas?x=1" }, "https://marca.es")?.url, "https://www.marca.es/rebajas?x=1");
  assert.equal(mapDeal({ ...deal, Uri: "  " }, "https://marca.es")?.url, "https://marca.es");
  assert.equal(mapDeal({ ...deal, Uri: "javascript:alert(1)" }, "https://marca.es")?.url, "https://marca.es");
});

test("Impact: only campaigns whose contract is exactly active (INACTIVE and DEACTIVATED are not)", () => {
  assert.equal(activeContract({ ContractStatus: "Active" }), true);
  assert.equal(activeContract({ ContractStatus: "ACTIVE" }), true);
  assert.equal(activeContract({}), true); // the API leaves it out: the campaign is listed because we have a contract
  assert.equal(activeContract({ ContractStatus: "Inactive" }), false);
  assert.equal(activeContract({ ContractStatus: "DEACTIVATED" }), false);
  assert.equal(activeContract({ ContractStatus: "Expired" }), false);
});

test("Impact deal takes its product image (https only); BOGO deals take the get or buy image", () => {
  const deal = { Id: "5", Name: "Zapatillas", CampaignId: "9", State: "ACTIVE" };
  assert.equal(mapDeal(deal)?.image, undefined);
  assert.equal(mapDeal({ ...deal, Products: [{ ProductImageUrl: "https://img.marca.es/z.jpg" }] })?.image, "https://img.marca.es/z.jpg");
  assert.equal(mapDeal({ ...deal, Products: [{ ProductImageUrl: "http://img.marca.es/z.jpg" }] })?.image, undefined);
  assert.equal(mapDeal({ ...deal, Products: [{ ProductImageUrl: "javascript:alert(1)" }] })?.image, undefined);
  const bogo = { ...deal, Type: "BOGO", BogoBuyImageUrl: "https://img.marca.es/buy.jpg" };
  assert.equal(mapDeal(bogo)?.image, "https://img.marca.es/buy.jpg");
  assert.equal(mapDeal({ ...bogo, BogoGetImageUrl: "https://img.marca.es/get.jpg" })?.image, "https://img.marca.es/get.jpg");
});

test("impact reads deals per campaign, the partner API's only deals route", async () => {
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url.replace(/[?&]PageSize=.*$/, ""));
    const body = url.includes("/Campaigns/7/Deals")
      ? { Deals: [{ Id: "d1", Name: "10% en todo", CampaignId: "7", State: "ACTIVE", DefaultPromoCode: "TEN", DiscountPercent: "10" }] }
      : url.includes("/Deals")
        ? { Deals: [] }
        : { Campaigns: [{ CampaignId: "7", CampaignName: "Tienda", CampaignUrl: "https://tienda.es", ContractStatus: "Active" }, { CampaignId: "8", CampaignName: "Vieja", ContractStatus: "Expired" }] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const feed = await impact.fetchFeed({ accountSid: "IRabc", authToken: "t" });
    assert.deepEqual(calls, ["https://api.impact.com/Mediapartners/IRabc/Campaigns", "https://api.impact.com/Mediapartners/IRabc/Campaigns/7/Deals"]);
    assert.deepEqual(feed.offers.map((o) => [o.id, o.code, o.discount]), [["d1", "TEN", "10%"]]);
  } finally {
    globalThis.fetch = real;
  }
});
