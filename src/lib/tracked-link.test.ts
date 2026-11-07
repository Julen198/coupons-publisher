import { test } from "node:test";
import assert from "node:assert/strict";
import { altDomainsInput, clickrefFor, destinationOf, isTracked, registrableDomain, storeLinkProblem, trackedLinkOf, type LinkStore, type TrackedLink } from "./tracked-link.ts";

const site = { client: { slug: "cuponlab", awin_affiliate_id: "" }, awinPublishers: new Set(["111111", "222222"]) };
const awinStore = (over: Partial<LinkStore> = {}): LinkStore => ({ slug: "el-corte-ingles", network: "awin", merchant_id: "13075", tracking_url: "", website: "https://www.elcorteingles.es", publisher_id: "222222", ...over });
const url = (l: TrackedLink) => (isTracked(l) ? new URL(l.url) : assert.fail(`expected a tracked link, got ${JSON.stringify(l)}`));
const problem = (l: TrackedLink) => (isTracked(l) ? assert.fail(`expected a problem, got ${l.url}`) : l.problem);

test("registrableDomain keeps country second levels", () => {
  assert.equal(registrableDomain("www.fnac.es"), "fnac.es");
  assert.equal(registrableDomain("shop.amazon.co.uk"), "amazon.co.uk");
  assert.equal(registrableDomain("tienda.com.es"), "tienda.com.es");
  assert.equal(registrableDomain("es.trip.com"), "trip.com");
  assert.equal(registrableDomain("localhost"), "");
  assert.equal(registrableDomain("10.0.0.1"), "");
});

test("an Awin feed coupon on the store's domain: awin1 cread with our publisher id, the merchant and the page", () => {
  const u = url(trackedLinkOf({ id: 880, target_url: "https://www.elcorteingles.es/electrodomesticos/A55507294", publisher_id: "222222" }, awinStore(), site));
  assert.equal(u.origin + u.pathname, "https://www.awin1.com/cread.php");
  assert.equal(u.searchParams.get("awinmid"), "13075");
  assert.equal(u.searchParams.get("awinaffid"), "222222");
  assert.equal(u.searchParams.get("clickref"), "cuponlab-el-corte-ingles-880");
  assert.equal(u.searchParams.get("ued"), "https://www.elcorteingles.es/electrodomesticos/A55507294");
});

test("web finds of an Awin store without merchant id are not tracked (the 226 bare store URLs)", () => {
  const decathlon = awinStore({ slug: "decathlon", merchant_id: "", website: "https://www.decathlon.es", publisher_id: "" });
  assert.equal(problem(trackedLinkOf({ id: 74, target_url: "https://www.decathlon.es" }, decathlon, site)), "no-merchant");
});

test("an Awin store with merchant but no publisher id anywhere is not tracked, and the panel says so", () => {
  const s = awinStore({ publisher_id: "" });
  assert.equal(problem(trackedLinkOf({ id: 1, target_url: "https://www.elcorteingles.es/x" }, s, site)), "no-publisher");
  assert.equal(storeLinkProblem(s), "no-publisher");
  assert.equal(storeLinkProblem(awinStore()), null);
});

test("an Awin publisher id that is none of our accounts is refused; the client's own id is fine", () => {
  const s = awinStore({ publisher_id: "999999" });
  assert.equal(problem(trackedLinkOf({ id: 1, target_url: "" }, s, site)), "unknown-publisher");
  const own = { ...site, client: { slug: "medio", awin_affiliate_id: "555555" } };
  assert.equal(url(trackedLinkOf({ id: 1, target_url: "" }, s, own)).searchParams.get("awinaffid"), "555555");
  // without the list of our accounts, any id passes (scripts and previews that don't load it)
  assert.ok(isTracked(trackedLinkOf({ id: 1, target_url: "" }, s, { client: site.client })));
});

test("Fnac #553: a deep link to another shop falls back to the store's tracked home", () => {
  const fnac = awinStore({ slug: "fnac", merchant_id: "77630", website: "https://www.fnac.es" });
  const l = trackedLinkOf({ id: 553, target_url: "https://www.pccomponentes.com/nilait", publisher_id: "222222" }, fnac, site);
  assert.equal(url(l).searchParams.get("ued"), "https://www.fnac.es/");
  assert.deepEqual(isTracked(l) && l.notes, ["foreign-destination"]);
});

test("Sprinter #491: sprintersports.com is accepted once it is one of the store's domains", () => {
  const sprinter = awinStore({ slug: "sprinter", merchant_id: "27904", website: "https://www.sprinter.es" });
  const c = { id: 491, target_url: "https://www.sprintersports.com/descuentos-black", publisher_id: "222222" };
  assert.equal(url(trackedLinkOf(c, sprinter, site)).searchParams.get("ued"), "https://www.sprinter.es/");
  const withAlt = { ...sprinter, alt_domains: "sprintersports.com" };
  assert.equal(url(trackedLinkOf(c, withAlt, site)).searchParams.get("ued"), "https://www.sprintersports.com/descuentos-black");
});

test("El Corte Inglés #484: an http destination is upgraded to https", () => {
  const l = trackedLinkOf({ id: 484, target_url: "http://www.elcorteingles.es/electronica/x?a=1", publisher_id: "222222" }, awinStore(), site);
  assert.equal(url(l).searchParams.get("ued"), "https://www.elcorteingles.es/electronica/x?a=1");
  assert.deepEqual(isTracked(l) && l.notes, ["https-upgraded"]);
});

test("Effiliation with no tracking link (alltricks, alpinstore before the fix) is not tracked; with it, it is", () => {
  const alltricks: LinkStore = { slug: "alltricks", network: "effiliation", merchant_id: "315019219", tracking_url: "", website: "https://www.alltricks.es" };
  const c = { id: 852, target_url: "https://www.alltricks.es/C-2108359-summer-bikewear" };
  assert.equal(problem(trackedLinkOf(c, alltricks, site)), "no-template");
  const fixed = { ...alltricks, tracking_url: "https://track.effiliation.com/servlet/effi.redir?id_compteur=11111111&effi_id={ref}&url={url}" };
  const u = url(trackedLinkOf(c, fixed, site));
  assert.equal(u.searchParams.get("effi_id"), "cuponlab-alltricks-852");
  assert.equal(u.searchParams.get("url"), c.target_url);
});

test("a tracking link of another network or a plain store URL pasted as template is refused", () => {
  const s: LinkStore = { slug: "x", network: "tradedoubler", merchant_id: "1", tracking_url: "https://www.x.es/?ref={ref}", website: "https://www.x.es" };
  assert.equal(problem(trackedLinkOf({ id: 1, target_url: "" }, s, site)), "bad-template");
  assert.equal(problem(trackedLinkOf({ id: 1, target_url: "" }, { ...s, tracking_url: "http://clk.tradedoubler.com/click?p=1&a=2&url={url}" }, site)), "bad-template");
  assert.ok(isTracked(trackedLinkOf({ id: 1, target_url: "" }, { ...s, tracking_url: "https://clk.tradedoubler.com/click?p=1&a=2&epi={ref}&url={url}" }, site)));
});

test("each network's own link shape passes", () => {
  const cases: [string, string, string][] = [
    ["cj", "https://www.anrdoezrs.net/click-100-200?sid={ref}&url={url}", ""],
    ["rakuten", "https://click.linksynergy.com/deeplink?id=AbC&mid=4321&u1={ref}&murl={url}", "4321"],
    ["impact", "https://underarmoures.sjv.io/c/1/2/113?subId1={ref}", "113"],
    ["admitad", "https://ad.admitad.com/g/abc123/?subid={ref}&ulp={url}", ""],
    ["webgains", "https://track.webgains.com/click.html?wgcampaignid=1&wgprogramid=2&clickref={ref}&wgtarget={url}", "2"],
    ["adtraction", "https://track.adtraction.com/t/t?a=1&as=2&t=2&tk=1&epi={ref}&url={url}", ""],
    ["kwanko", "https://action.metaffiliation.com/trk.php?mclic=P1&redir={url}&argsite={ref}", ""],
    ["affilae", "{url}?ae=42&aev={ref}", ""],
    ["partnerize", "https://prf.hn/click/camref:1l3abc/pubref:{ref}/destination:{url}", ""],
    ["tradetracker", "https://tc.tradetracker.net/?c=1&m=0&a=2&r={ref}&u={url}", ""],
    ["daisycon", "https://ds1.nl/c/?si=1&li=2&wi=3&ws={ref}&dl={url}", ""],
  ];
  for (const [network, tracking_url, merchant_id] of cases) {
    const l = trackedLinkOf({ id: 7, target_url: "https://www.tienda.es/p" }, { slug: "tienda", network, merchant_id, tracking_url, website: "https://www.tienda.es" }, site);
    assert.ok(isTracked(l), `${network}: ${JSON.stringify(l)}`);
  }
  // Impact: the campaign in the path must be the store's
  const ua = { slug: "ua", network: "impact", merchant_id: "113", tracking_url: "https://underarmoures.sjv.io/c/1/2/999?subId1={ref}", website: "https://www.underarmour.es" };
  assert.equal(problem(trackedLinkOf({ id: 1, target_url: "" }, ua, site)), "bad-template");
  // Otra red: nothing to check against
  assert.equal(problem(trackedLinkOf({ id: 1, target_url: "" }, { ...ua, network: "other" }, site)), "unknown-network");
});

test("a store without website can't have its destination checked", () => {
  assert.equal(problem(trackedLinkOf({ id: 1, target_url: "https://x.es" }, awinStore({ website: "" }), site)), "no-website");
});

test("the client's own account link wins over ours", () => {
  const s: LinkStore = { slug: "t", network: "webgains", merchant_id: "2", tracking_url: "https://track.webgains.com/click.html?wgcampaignid=1&wgprogramid=2&clickref={ref}&wgtarget={url}", website: "https://t.es" };
  const own = "https://track.webgains.com/click.html?wgcampaignid=77&wgprogramid=2&clickref={ref}&wgtarget={url}";
  assert.equal(url(trackedLinkOf({ id: 1, target_url: "" }, s, { ...site, clientTemplate: own })).searchParams.get("wgcampaignid"), "77");
});

test("destinationOf: page on the store's domains, else home; none without a website", () => {
  assert.deepEqual(destinationOf({ target_url: "https://es.trip.com/hotels" }, { website: "https://www.trip.com" }), { url: "https://es.trip.com/hotels", notes: [] });
  assert.deepEqual(destinationOf({ target_url: "" }, { website: "www.x.es" }), { url: "https://www.x.es/", notes: ["no-destination"] });
  assert.equal(destinationOf({ target_url: "https://x.es" }, { website: "" }), null);
});

test("clickref: <client>-<store>-<coupon>, [a-z0-9-], within the network's sub-id limit", () => {
  assert.equal(clickrefFor("cuponlab", "el-corte-ingles", 880, "awin"), "cuponlab-el-corte-ingles-880");
  assert.equal(clickrefFor("La Vanguardia", "Fnac_ES", 1, "awin"), "la-vanguardia-fnac-es-1");
  const long = clickrefFor("el-periodico-de-catalunya-digital", "tienda-con-un-nombre-larguisimo-de-verdad", 123456, "awin");
  assert.ok(long.length <= 50, long);
  assert.ok(long.startsWith("el-periodico") && long.endsWith("-123456"), long);
  assert.ok(clickrefFor("a".repeat(80), "b".repeat(80), 9, "awin").length <= 50);
  assert.ok(clickrefFor("cuponlab", "x".repeat(70), 9, "rakuten").length <= 72);
});

test("altDomainsInput normalises a list to registrable domains", () => {
  assert.equal(altDomainsInput("sprintersports.com, https://www.sprinter.pt/x  sprintersports.com"), "sprintersports.com,sprinter.pt");
  assert.equal(altDomainsInput(""), "");
  assert.throws(() => altDomainsInput("no es un dominio"), /no es un dominio/);
});
