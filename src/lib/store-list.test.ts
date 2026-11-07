import { test } from "node:test";
import assert from "node:assert/strict";
import { bestDiscountLine, guideLabels } from "./store-list.ts";

test("bestDiscountLine shows the store's biggest discount, and says when it needs a code", () => {
  assert.equal(bestDiscountLine([{ discount: "10%", kind: "deal" }, { discount: "15%", kind: "code" }]), "15 % con código");
  assert.equal(bestDiscountLine([{ discount: "Hasta 70%", kind: "deal" }, { discount: "5 €", kind: "code" }]), "Hasta 70 %");
});

test("bestDiscountLine falls back to a euro figure or a short badge, and to nothing without one", () => {
  assert.equal(bestDiscountLine([{ discount: "Envío gratis", kind: "deal" }, { discount: "10€ de descuento", kind: "code" }, { discount: "5€", kind: "code" }]), "10 € con código");
  assert.equal(bestDiscountLine([{ discount: "2x1", kind: "deal" }]), "2x1");
  assert.equal(bestDiscountLine([{ discount: "Precio rebajado", kind: "deal" }, { discount: "", kind: "code" }]), "");
  assert.equal(bestDiscountLine([]), "");
});

test("guideLabels name a store by its codes when it has them, by its offers when not", () => {
  assert.deepEqual(guideLabels("43einhalb", 6, 6), { heading: "Códigos descuento 43einhalb", link: "Ver los 6 códigos de 43einhalb" });
  assert.deepEqual(guideLabels("PcComponentes", 9, 0), { heading: "Ofertas PcComponentes", link: "Ver las 9 ofertas de PcComponentes" });
  assert.deepEqual(guideLabels("Zalando", 7, 2), { heading: "Códigos descuento Zalando", link: "Ver los 7 cupones de Zalando" });
});

test("guideLabels say one coupon in the singular", () => {
  assert.equal(guideLabels("Asics", 1, 1).link, "Ver el código de Asics");
  assert.equal(guideLabels("Dyson", 1, 0).link, "Ver la oferta de Dyson");
});
