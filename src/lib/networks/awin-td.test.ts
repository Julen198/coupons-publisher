import { test } from "node:test";
import assert from "node:assert/strict";
import { forSpain, mapPromotion, mapProgramme } from "./awin.ts";
import { liveVouchers, mapVoucher, pastedTemplate, trackingTemplate, type Voucher } from "./tradedoubler.ts";

test("Awin voucher → code coupon; hidden code is skipped; promotion → deal", () => {
  const base = { promotionId: 5, advertiser: { id: 77008, name: "adidas" }, title: "15% en todo", endDate: "2026-12-31T00:00:00.000", url: "https://www.adidas.es/x" };
  assert.deepEqual(mapPromotion({ ...base, type: "voucher", voucher: { code: "SAVE15" } }), {
    id: "5", advertiserId: "77008", kind: "code", title: "15% en todo", code: "SAVE15", discount: "15%", description: "", url: "https://www.adidas.es/x", expires: "2026-12-31",
  });
  assert.equal(mapPromotion({ ...base, type: "voucher", voucher: { code: null } }), null);
  assert.equal(mapPromotion({ ...base, type: "promotion" })?.kind, "deal");
  assert.equal(mapProgramme({ id: 1, name: "adidas ES", displayUrl: "www.adidas.es/es" }).website, "https://www.adidas.es");
});

test("Tradedoubler tracking link becomes a {url}/{ref} template in either syntax", () => {
  const t = "https://clk.tradedoubler.com/click?p=67890&a=11111&epi={ref}&url={url}";
  assert.equal(trackingTemplate("http://clk.tradedoubler.com/click?a(11111)p(67890)ttid(13)url(http://x.com)"), t);
  assert.equal(trackingTemplate("https://clk.tradedoubler.com/click?p=67890&a=11111&g=1"), t);
  assert.equal(trackingTemplate("https://example.com"), "");
});

test("Tradedoubler voucher types map to code / deal and a badge", () => {
  const v = { id: 1, programId: 9, programName: "Shop", title: "Envío", voucherTypeId: 4, code: "", endDate: "2026-11-30T23:59:59Z", landingUrl: "https://shop.es" };
  assert.deepEqual(
    { kind: mapVoucher(v).kind, discount: mapVoucher(v).discount, expires: mapVoucher(v).expires },
    { kind: "deal", discount: "Envío gratis", expires: "2026-11-30" },
  );
  const c = mapVoucher({ ...v, voucherTypeId: 1, code: "TEN", discountAmount: 10, isPercentage: true });
  assert.deepEqual([c.kind, c.code, c.discount], ["code", "TEN", "10%"]);
});

test("Awin: an «all regions» promotion only counts from our Spanish programmes; others must name ES", () => {
  const spanish = new Set(["1"]);
  assert.equal(forSpain({ advertiser: { id: 1, name: "ES shop" }, regions: { all: true } }, spanish), true);
  assert.equal(forSpain({ advertiser: { id: 2, name: "Pc Componentes IT" }, regions: { all: true } }, spanish), false);
  assert.equal(forSpain({ advertiser: { id: 2, name: "X" }, regions: { all: false, list: [{ countryCode: "ES" }] } }, spanish), true);
  assert.equal(forSpain({ advertiser: { id: 2, name: "X" }, regions: { all: false, list: [{ countryCode: "IT" }] } }, spanish), false);
});

test("a Tradedoubler link pasted by hand becomes a template with its programme id", () => {
  assert.deepEqual(pastedTemplate("https://clk.tradedoubler.com/click?p=270504&a=3123456&g=25987654"), {
    template: "https://clk.tradedoubler.com/click?p=270504&a=3123456&epi={ref}&url={url}",
    programId: "270504",
  });
  assert.deepEqual(pastedTemplate("http://clk.tradedoubler.com/click?a(3123456)p(270504)ttid(13)"), {
    template: "https://clk.tradedoubler.com/click?p=270504&a=3123456&epi={ref}&url={url}",
    programId: "270504",
  });
  // already a template, another host or no site id: left as typed
  assert.equal(pastedTemplate("https://clk.tradedoubler.com/click?p=1&a=2&epi={ref}&url={url}"), null);
  assert.equal(pastedTemplate("https://ad.admitad.com/g/abc/"), null);
  assert.equal(pastedTemplate("https://clk.tradedoubler.com/click?p=270504"), null);
});

test("Tradedoubler vouchers as the API sends them: dates in epoch ms strings, expired ones dropped", () => {
  const huawei = {
    id: 13577029, programId: 304859, programName: "Huawei ES", code: "ABF26MARV", endDate: "1796166000000",
    title: "HUAWEI Black Friday - 10% Cupón extra", voucherTypeId: 1, discountAmount: 10, isPercentage: true,
    defaultTrackUri: "https://clk.tradedoubler.com/click?a(2334356)p(304859)ttid(13)url(https://consumer.huawei.com/es/offer/black-friday/)",
    landingUrl: "https://consumer.huawei.com/es/offer/black-friday/",
  } as Voucher;
  const old = { ...huawei, id: 1, endDate: "1700000000000" } as Voucher;
  const open = { ...huawei, id: 2, endDate: undefined } as Voucher;
  const now = Date.parse("2026-11-23T08:00:00Z");
  assert.deepEqual(liveVouchers([huawei, old, open], now).map((v) => v.id), [13577029, 2]);
  const o = mapVoucher(huawei);
  assert.equal(o.expires, "2026-12-01");
  assert.equal(o.code, "ABF26MARV");
  assert.equal(o.discount, "10%");
  assert.equal(trackingTemplate(huawei.defaultTrackUri), "https://clk.tradedoubler.com/click?p=304859&a=2334356&epi={ref}&url={url}");
});
