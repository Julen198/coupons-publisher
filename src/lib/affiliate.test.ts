import { test } from "node:test";
import assert from "node:assert/strict";
import { affiliateUrl, pageTitle, parseFaqs, trackingUrl } from "./affiliate.ts";

test("affiliateUrl wraps target in Awin link with encoded ued", () => {
  const url = new URL(affiliateUrl("https://www.adidas.es/outlet?a=1&b=2", { affiliateId: "123", merchantId: "77008", clickref: "demo-adidas" }));
  assert.equal(url.host, "www.awin1.com");
  assert.equal(url.searchParams.get("awinmid"), "77008");
  assert.equal(url.searchParams.get("awinaffid"), "123");
  assert.equal(url.searchParams.get("clickref"), "demo-adidas");
  assert.equal(url.searchParams.get("ued"), "https://www.adidas.es/outlet?a=1&b=2");
});

test("affiliateUrl falls back to raw URL without IDs", () => {
  assert.equal(affiliateUrl("https://x.es", { affiliateId: "", merchantId: "1", clickref: "" }), "https://x.es");
});

test("pageTitle adds top discounts and Spanish month", () => {
  assert.equal(pageTitle("adidas", ["15%", "10€", "15%", ""], new Date(2026, 9, 1)), "Código descuento adidas 15% | 10€ octubre 2026");
  assert.equal(pageTitle("Shein", [], new Date(2026, 0, 1)), "Código descuento Shein enero 2026");
});

test("parseFaqs skips malformed lines", () => {
  assert.deepEqual(parseFaqs("¿A? | Sí\nsin respuesta\n | x"), [{ q: "¿A?", a: "Sí" }]);
});

test("other networks: the pasted tracking link gets the destination and the subid", () => {
  const tpl = "https://clk.tradedoubler.com/click?p=123&a=456&epi={ref}&url={url}";
  assert.equal(
    trackingUrl(tpl, "https://www.zara.com/es/?a=1&b=2", "demo-zara-7"),
    "https://clk.tradedoubler.com/click?p=123&a=456&epi=demo-zara-7&url=https%3A%2F%2Fwww.zara.com%2Fes%2F%3Fa%3D1%26b%3D2",
  );
  // no placeholders: used as is (the network sends to the store's home)
  assert.equal(trackingUrl("https://ad.admitad.com/g/abc123/", "https://x.es", "r"), "https://ad.admitad.com/g/abc123/");
  // no link yet: straight to the store
  assert.equal(trackingUrl("", "https://x.es/p", "r"), "https://x.es/p");
});
