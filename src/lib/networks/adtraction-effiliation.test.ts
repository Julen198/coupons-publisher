import { test } from "node:test";
import assert from "node:assert/strict";
import { mapOffer as mapAdtractionOffer, mapProgram as mapAdtractionProgram } from "./adtraction.ts";
import { mapLink, mapProgram as mapEffiliationProgram } from "./effiliation.ts";
import { trackingUrl } from "../affiliate.ts";

test("Adtraction programme → tracking link with epi (ref) and url; none without an approved link", () => {
  const p = { programId: "629059552", programName: "Kitchentime ES ", programURL: "www.kitchentime.es/es", trackingURL: "https://track.adtraction.com/t/t?a=24209996&as=24577691&t=2&tk=1" };
  const adv = mapAdtractionProgram(p);
  assert.deepEqual([adv.id, adv.name, adv.website], ["629059552", "Kitchentime ES", "https://www.kitchentime.es"]);
  assert.equal(
    trackingUrl(adv.trackingTemplate, "https://www.kitchentime.es/a?b=1", "medio-kt-9"),
    "https://track.adtraction.com/t/t?a=24209996&as=24577691&t=2&tk=1&epi=medio-kt-9&url=https%3A%2F%2Fwww.kitchentime.es%2Fa%3Fb%3D1",
  );
  assert.equal(mapAdtractionProgram({ ...p, trackingURL: undefined }).trackingTemplate, "");
});

test("Adtraction offer: type 1 with a coupon → code, else deal; validTo keeps its day", () => {
  const o = { offerId: "1234567890", programId: "1062755777", offerCoupon: "summersale123", offerDescription: "10 % discount on all bags", offerTerms: "Min. 50 €", offerPage: "https://www.sportamore.es/offer", offerType: "1", validTo: "2026-01-31T23:59:59+0100" };
  assert.deepEqual(mapAdtractionOffer(o), {
    id: "1234567890", advertiserId: "1062755777", kind: "code", title: "10 % discount on all bags", code: "summersale123",
    discount: "10 %", description: "Min. 50 €", url: "https://www.sportamore.es/offer", expires: "2026-01-31",
  });
  assert.equal(mapAdtractionOffer({ ...o, offerType: "2", offerCoupon: "" }).kind, "deal");
});

test("Effiliation programme → its default tracked link plus effi_id (ref) and url", () => {
  const p = { programId: 42, merchantName: "Maison ", merchantUrl: "https://www.maison.es/", defaultTrackedLink: "https://track.effiliation.com/servlet/effi.redir?id_compteur=987" };
  const adv = mapEffiliationProgram(p);
  assert.deepEqual([adv.id, adv.name, adv.website], ["42", "Maison", "https://www.maison.es"]);
  assert.equal(
    trackingUrl(adv.trackingTemplate, "https://www.maison.es/x", "m-1"),
    "https://track.effiliation.com/servlet/effi.redir?id_compteur=987&effi_id=m-1&url=https%3A%2F%2Fwww.maison.es%2Fx",
  );
  assert.equal(mapEffiliationProgram({ ...p, defaultTrackedLink: "" }).trackingTemplate, "");
});

test("Effiliation voucherOrDeal link: promo voucher/code → code, percentage → badge", () => {
  const l = { linkId: 7, programId: 42, linkName: "-15% sur tout", text: "Hasta el domingo", urlRedir: "https://www.maison.es/promo", endDate: "2026-12-31 23:59:59", promo: { voucher: "MAISON15", code: "", value: 15, valueType: "percentage", validityEndDate: "2026-12-30" } };
  assert.deepEqual(mapLink(l), {
    id: "7", advertiserId: "42", kind: "code", title: "-15% sur tout", code: "MAISON15", discount: "15%",
    description: "Hasta el domingo", url: "https://www.maison.es/promo", expires: "2026-12-30",
  });
  assert.equal(mapLink({ ...l, promo: { code: "ALT" } }).code, "ALT");
  const deal = mapLink({ ...l, promo: undefined });
  assert.deepEqual([deal.kind, deal.discount, deal.expires], ["deal", "-15%", "2026-12-31"]);
});

// Sanitized from the real GET /publisher/programs answer (Nov 2026): the default tracked link already carries url=,
// status says whether our partnership is live, coverageCountries the market
const EFFI_PROGRAMS = [
  { programId: 315019219, merchantName: "Alltricks.es", merchantUrl: "https://www.alltricks.es/", status: "active", coverageCountries: '["Spain"]',
    defaultTrackedLink: "https://track.effiliation.com/servlet/effi.redir?id_compteur=11111111&url=https%3A%2F%2Fwww.alltricks.es%2F" },
  { programId: 315033304, merchantName: "alpinstore", merchantUrl: "https://www.alpinstore.com", status: "inactive", coverageCountries: '["France"]',
    defaultTrackedLink: "https://track.effiliation.com/servlet/effi.redir?id_compteur=22222222&url=https%3A%2F%2Fwww.alpinstore.com" },
];

test("Effiliation: a default tracked link that already has url= is rebuilt with our ref and the coupon's page", () => {
  const adv = mapEffiliationProgram(EFFI_PROGRAMS[0]);
  assert.equal(adv.trackingTemplate, "https://track.effiliation.com/servlet/effi.redir?id_compteur=11111111&effi_id={ref}&url={url}");
  assert.equal(
    trackingUrl(adv.trackingTemplate, "https://www.alltricks.es/C-2108359-summer-bikewear", "cuponlab-alltricks-852"),
    "https://track.effiliation.com/servlet/effi.redir?id_compteur=11111111&effi_id=cuponlab-alltricks-852&url=https%3A%2F%2Fwww.alltricks.es%2FC-2108359-summer-bikewear",
  );
  assert.equal(adv.country, "ES");
});

test("Effiliation: an inactive partnership gets no link (it would not pay), and its country comes from coverageCountries", () => {
  const adv = mapEffiliationProgram(EFFI_PROGRAMS[1]);
  assert.equal(adv.trackingTemplate, "");
  assert.equal(adv.country, "FR");
  // several countries or none: no country
  assert.equal(mapEffiliationProgram({ ...EFFI_PROGRAMS[0], coverageCountries: '["Spain","France"]' }).country, undefined);
  assert.equal(mapEffiliationProgram({ ...EFFI_PROGRAMS[0], coverageCountries: "nope" }).country, undefined);
  // http links and other hosts are not trusted
  assert.equal(mapEffiliationProgram({ ...EFFI_PROGRAMS[0], defaultTrackedLink: "http://track.effiliation.com/servlet/effi.redir?id_compteur=1" }).trackingTemplate, "");
  assert.equal(mapEffiliationProgram({ ...EFFI_PROGRAMS[0], defaultTrackedLink: "https://evil.example/servlet/effi.redir?id_compteur=1" }).trackingTemplate, "");
});
