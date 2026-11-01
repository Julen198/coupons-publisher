import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPromotion, mapProgramme } from "./awin.ts";
import { mapVoucher, trackingTemplate } from "./tradedoubler.ts";

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
