import assert from "node:assert/strict";
import { test } from "node:test";
import { BRANDS, BRAND_NONE, brandFaqs, brandInput, brandOf, brandTitle, brandsInText, dealBrands, indexableBrand, listOf } from "./brands.ts";
import { CATEGORIES } from "./catalog.ts";

test("brand slugs are unique, URL-safe and their categories exist", () => {
  assert.equal(new Set(BRANDS.map((b) => b.slug)).size, BRANDS.length);
  for (const b of BRANDS) {
    assert.match(b.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, b.slug);
    assert.ok(!b.category || CATEGORIES.some((c) => c.slug === b.category), b.slug);
    assert.ok(b.about.startsWith(b.name), b.slug);
  }
  // no name or alias belongs to two brands
  const names = BRANDS.flatMap((b) => [b.name, ...(b.aliases ?? [])].map((n) => n.toLowerCase()));
  assert.equal(new Set(names).size, names.length);
});

test("brandsInText: whole words in any case, aliases, longest name first", () => {
  assert.deepEqual(brandsInText("Zapatillas NIKE Air Max 90 -30%"), ["nike"]);
  assert.deepEqual(brandsInText("iPhone 16 Pro de 256 GB"), ["apple"]);
  assert.deepEqual(brandsInText("Smart TV Samsung y barra de sonido LG"), ["samsung", "lg"]);
  assert.deepEqual(brandsInText("New Balance 530 por 69 €"), ["new-balance"]);
  assert.deepEqual(brandsInText("Cafetera De'Longhi Magnifica S"), ["delonghi"]);
  assert.deepEqual(brandsInText("Cafetera DeLonghi Dedica"), ["delonghi"]);
  assert.deepEqual(brandsInText("Consola PS5 Slim de Sony"), ["playstation", "sony"]);
  assert.deepEqual(brandsInText("Pumas y sonyeros"), []);
  assert.deepEqual(brandsInText("Hasta 50% en moda de invierno"), []);
});

test("brandsInText: an accessory for a brand is not the brand", () => {
  assert.deepEqual(brandsInText("Funda para iPhone 15 de silicona"), []);
  assert.deepEqual(brandsInText("Cargador compatible con Samsung Galaxy"), []);
  assert.deepEqual(brandsInText("Base de carga para tu PS5"), []);
  assert.deepEqual(brandsInText("Funda Spigen para iPhone y cargador Anker"), []);
  assert.deepEqual(brandsInText("Auriculares Sony compatibles con iPhone"), ["sony"]);
});

test("dealBrands: the editor's choice, else the title, else the store's own brand", () => {
  assert.deepEqual(dealBrands({ title: "Zapatillas Adidas Samba", store_name: "Zalando" }), ["adidas"]);
  assert.deepEqual(dealBrands({ title: "20% en zapatillas de running", store_name: "Nike" }), ["nike"]);
  assert.deepEqual(dealBrands({ title: "Adidas Samba en oferta", store_name: "Nike" }), ["adidas"]);
  assert.deepEqual(dealBrands({ title: "10% en tu primer pedido", store_name: "MediaMarkt" }), []);
  assert.deepEqual(dealBrands({ title: "Funda para iPhone", store_name: "Amazon", brand: "apple" }), ["apple"]);
  assert.deepEqual(dealBrands({ title: "Zapatillas Nike", store_name: "Zalando", brand: BRAND_NONE }), []);
  assert.deepEqual(dealBrands({ title: "Zapatillas Nike", store_name: "Zalando", brand: "" }), ["nike"]);
  assert.deepEqual(dealBrands({ title: "Zapatillas Nike", store_name: "Zalando", brand: null }), ["nike"]);
});

test("brandInput keeps known slugs, '-' and nothing else", () => {
  assert.equal(brandInput(""), "");
  assert.equal(brandInput("-"), "-");
  assert.equal(brandInput("nike, adidas,nike,unknown"), "nike,adidas");
  assert.equal(brandInput("unknown"), "");
});

test("brand pages: lookup and index threshold", () => {
  assert.equal(brandOf("samsung")?.name, "Samsung");
  assert.equal(brandOf("nope"), undefined);
  assert.equal(indexableBrand(2), false);
  assert.equal(indexableBrand(3), true);
});

test("brandTitle and brandFaqs follow the live deals", () => {
  const samsung = brandOf("samsung")!;
  const now = new Date("2026-11-23T10:00:00Z");
  const deals = [
    { kind: "code", code: "TV10", discount: "10%", store_name: "MediaMarkt" },
    { kind: "deal", code: "", discount: "Hasta 35 %", store_name: "Amazon" },
    { kind: "deal", code: "", discount: "50 €", store_name: "Amazon" },
  ];
  assert.equal(brandTitle(samsung, deals, now), "Ofertas Samsung: hasta 35 % de descuento en noviembre 2026");
  assert.equal(brandTitle(samsung, [], now), "Ofertas Samsung y códigos descuento en noviembre 2026");
  const faqs = brandFaqs(samsung, deals);
  assert.match(faqs[0].a, /en MediaMarkt y Amazon\./);
  assert.match(faqs[1].a, /^Sí: hoy hay 1 oferta de Samsung con código\. Las demás/);
  assert.match(brandFaqs(samsung, [])[0].a, /no tenemos ofertas activas/);
  assert.match(brandFaqs(brandOf("lego")!, [])[2].a, /Black Friday/);
  assert.equal(listOf(["A", "B", "C"]), "A, B y C");
});
