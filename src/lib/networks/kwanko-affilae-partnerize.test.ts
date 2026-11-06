import { test } from "node:test";
import assert from "node:assert/strict";
import { deeplinkTemplate, mapVoucherAd } from "./kwanko.ts";
import { mapVoucher as mapAffilaeVoucher, partnershipTemplate } from "./affilae.ts";
import { mapPartnerizeVoucher, participationTemplate } from "./partnerize.ts";
import { trackingUrl } from "../affiliate.ts";

test("Kwanko deeplink: {XXX} becomes the page, argsite carries our ref", () => {
  const t = deeplinkTemplate("https://action.metaffiliation.com/trk.php?mclic=P1234&redir={XXX}");
  assert.equal(trackingUrl(t, "https://shop.es/a?b=1", "m-1"), "https://action.metaffiliation.com/trk.php?mclic=P1234&redir=https%3A%2F%2Fshop.es%2Fa%3Fb%3D1&argsite=m-1");
  assert.equal(deeplinkTemplate("https://action.metaffiliation.com/trk.php?mclic=P1234"), "");
});

test("Kwanko voucher ad → code coupon on the campaign's site", () => {
  const ad = { id: "CODE.2.3.4", name: "-10% en todo", description: "Solo online", code: "KW10", campaign: { id: 1111, name: "Shop" }, validity_date: { end: "2026-12-31T22:59:59+00:00" } };
  assert.deepEqual(mapVoucherAd(ad, "https://shop.es"), {
    id: "CODE.2.3.4", advertiserId: "1111", kind: "code", title: "-10% en todo", code: "KW10", discount: "-10%", description: "Solo online", url: "https://shop.es", expires: "2026-12-31",
  });
  assert.equal(mapVoucherAd({ ...ad, code: "" }, "").kind, "deal");
});

test("Affilae: parameter partnerships track by appending ae/aev to the page; other link types aren't built by hand", () => {
  const t = partnershipTemplate({ trackingId: 42, urlType: "parameter" });
  assert.equal(trackingUrl(t, "https://shop.fr/x", "m 1"), "https://shop.fr/x?ae=42&aev=m%201");
  assert.equal(trackingUrl(t, "https://shop.fr/x?y=2", "m"), "https://shop.fr/x?y=2&ae=42&aev=m");
  assert.equal(partnershipTemplate({ trackingId: 42, urlType: "redirect" }), "");
});

test("Affilae voucher: named codes keep their name, bare ones read «Código X»; the coupon ad text describes it", () => {
  const v = { id: "a".repeat(24), program: "p1", name: "SUMMER10", code: "SUMMER10", activeTo: "2026-08-31T21:59:59Z" };
  const o = mapAffilaeVoucher(v, "-10% en toda la tienda con el código SUMMER10", "https://shop.fr");
  assert.deepEqual([o.title, o.code, o.kind, o.discount, o.advertiserId, o.expires, o.url], ["-10% en toda la tienda con el código SUMMER10", "SUMMER10", "code", "-10%", "p1", "2026-08-31", "https://shop.fr"]);
  assert.equal(mapAffilaeVoucher(v, "", "").title, "Código SUMMER10");
  assert.equal(mapAffilaeVoucher({ ...v, name: "Verano" }, "", "").title, "Verano");
});

test("Partnerize: pubref and destination go after the camref link, only when deep linking is allowed", () => {
  const p = { campaign_info: { tracking_link: "https://prf.hn/click/camref:1100l3", allow_deep_linking: "y" } };
  assert.equal(trackingUrl(participationTemplate(p), "https://shop.es/a", "m-1"), "https://prf.hn/click/camref:1100l3/pubref:m-1/destination:https%3A%2F%2Fshop.es%2Fa");
  assert.equal(participationTemplate({ campaign_info: { ...p.campaign_info, allow_deep_linking: "n" } }), "https://prf.hn/click/camref:1100l3/pubref:{ref}");
});

test("Partnerize voucher: no title in the API, so the description or the code stands in; inactive ones are dropped", () => {
  const v = { voucher_code_id: "111l15", campaign_id: "10l176", voucher_code: "PZ15", description: "", end_date_time: "2026-09-30 15:00:00", active: "y" };
  assert.deepEqual(mapPartnerizeVoucher(v, "https://shop.es"), {
    id: "111l15", advertiserId: "10l176", kind: "code", title: "Código PZ15", code: "PZ15", discount: "", description: "", url: "https://shop.es", expires: "2026-09-30",
  });
  assert.equal(mapPartnerizeVoucher({ ...v, description: "15% en zapatillas" }, "")?.title, "15% en zapatillas");
  assert.equal(mapPartnerizeVoucher({ ...v, active: "n" }, ""), null);
});
