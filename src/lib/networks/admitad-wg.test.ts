import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCoupon, mapProgram } from "./admitad.ts";
import { mapOffer, mapVoucher, trackingTemplate } from "./webgains.ts";
import { trackingUrl } from "../affiliate.ts";

test("Admitad program → https gotolink template with subid and ulp only when deeplinks are allowed", () => {
  const p = { id: 7, name: "AliExpress ES", site_url: "https://aliexpress.com/", gotolink: "http://ad.admitad.com/goto/abc/?i=5" };
  assert.equal(mapProgram({ ...p, allow_deeplink: true }).trackingTemplate, "https://ad.admitad.com/goto/abc/?subid={ref}&ulp={url}");
  assert.equal(mapProgram(p).trackingTemplate, "https://ad.admitad.com/goto/abc/?subid={ref}");
});

test("Admitad coupons: promocode → code, action → deal, other regions dropped", () => {
  const c = { id: 1, name: "-10% en todo", species: "promocode" as const, promocode: "TEN", date_end: "2026-12-31T00:00:00", campaign: { id: 7, name: "X", site_url: "https://x.es/a" } };
  assert.deepEqual(mapCoupon(c), { id: "1", advertiserId: "7", kind: "code", title: "-10% en todo", code: "TEN", discount: "-10%", description: "", url: "https://x.es", expires: "2026-12-31" });
  assert.equal(mapCoupon({ ...c, species: "action" })?.kind, "deal");
  assert.equal(mapCoupon({ ...c, regions: ["RU"] }), null);
  assert.equal(mapCoupon({ ...c, date_end: null })?.expires, "");
});

test("Webgains vouchers and offers keep separate ids; expiry is unix seconds", () => {
  const program = { id: 117, name: "Shop" };
  const v = mapVoucher({ id: 1, description: "Primer pedido", discount: "20% off your first order", destination: "https://shop.es", program, code: "W20", expiry_date: 1798675200 });
  assert.deepEqual([v.id, v.kind, v.discount, v.title, v.expires], ["v1", "code", "20%", "20% off your first order", "2026-12-31"]);
  assert.equal(mapOffer({ id: 1, title: "Rebajas", description: "", destination: "https://shop.es", program, expiry_date: 0 }).id, "o1");
});

test("Webgains template carries campaign, program, clickref and the encoded target", () => {
  assert.equal(
    trackingUrl(trackingTemplate("1068", 117), "https://shop.es/a?b=1", "medio-shop-9"),
    "https://track.webgains.com/click.html?wgcampaignid=1068&wgprogramid=117&clickref=medio-shop-9&wgtarget=https%3A%2F%2Fshop.es%2Fa%3Fb%3D1",
  );
});
