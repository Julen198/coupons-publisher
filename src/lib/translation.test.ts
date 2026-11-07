import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  checkTranslation, detectLang, estimateCost, estimateTokens, inputPriceFrom, needsTranslation, originalLabel, parseTranslateArgs, publicText,
  sourceHash, sourceLanguage, translationInput,
} from "./translation.ts";

test("detectLang: titles and conditions in other languages are 'other'", () => {
  for (const t of [
    "35% off Best Sellers + 40% new Inscription",
    "Free shipping on all orders over 50€",
    "Extra 20% off for new customers",
    "Get 15% off your first order with code SAVE15",
    "Livraison offerte dès 49€ d'achat",
    "-20% sur toute la boutique avec le code HIVER20",
    "Kostenloser Versand ab 30€ Bestellwert",
    "10% Rabatt für Neukunden auf alles",
    "Spedizione gratuita su tutti gli ordini",
    "Sconto del 15% per i nuovi clienti",
    "Frete grátis em compras acima de 50€",
    "Desconto de 10% na sua primeira compra",
    "Valid on full-price items only. Cannot be combined with other offers.",
  ]) assert.equal(detectLang(t), "other", t);
});

test("detectLang: Spanish titles and conditions are 'es'", () => {
  for (const t of [
    "Envío gratis en pedidos desde 50 €",
    "Hasta 30% en teles y portátiles",
    "10% de descuento para nuevos clientes",
    "Código descuento de 10€ en tu primera compra",
    "¡Rebajas! Hasta 70% en moda mujer",
    "No válido en productos rebajados. Pedido mínimo 30 €.",
    "2x1 en zapatillas seleccionadas",
    "Black Friday: 20% en todo",
    "Outlet hasta 50% off",
  ]) assert.equal(detectLang(t), "es", t);
});

test("detectLang: figures, codes and brand names alone are 'unknown' (never translated)", () => {
  for (const t of ["", "  ", "20%", "-15€", "SAVE10", "Nike Air Max", "Nike Air Max 90 -20%", "Adidas Ultraboost", "BF2026", "Samsung Galaxy S25 Ultra"]) {
    assert.equal(detectLang(t), "unknown", JSON.stringify(t));
  }
});

test("sourceLanguage names the language for the panel", () => {
  assert.equal(sourceLanguage("35% off Best Sellers + 40% new Inscription"), "en");
  assert.equal(sourceLanguage("Livraison offerte dès 49€ d'achat"), "fr");
  assert.equal(sourceLanguage("Kostenloser Versand ab 30€ Bestellwert"), "de");
  assert.equal(sourceLanguage("Spedizione gratuita su tutti gli ordini"), "it");
  assert.equal(sourceLanguage("Frete grátis em compras acima de 50€"), "pt");
  assert.equal(sourceLanguage("Envío gratis"), "");
  assert.equal(originalLabel("Free shipping", ""), "Original (inglés)");
  assert.equal(originalLabel("SAVE10", ""), "Original");
});

test("needsTranslation looks at title and conditions, without the store's own name", () => {
  assert.equal(needsTranslation({ title: "35% off Best Sellers + 40% new Inscription", description: "" }, "Ba&sh"), true);
  assert.equal(needsTranslation({ title: "Hasta 30% en teles", description: "Valid for new customers only" }, "Worten"), true);
  assert.equal(needsTranslation({ title: "Hasta 30% en teles", description: "Pedido mínimo 50 €" }, "Worten"), false);
  // "The" in the store name is no reason to translate
  assert.equal(needsTranslation({ title: "The North Face -20%", description: "" }, "The North Face"), false);
});

test("sourceHash is the md5 of title + newline + description (the same as SQL md5(title || E'\\n' || description))", () => {
  assert.equal(sourceHash("a", "b"), createHash("md5").update("a\nb", "utf8").digest("hex"));
  assert.notEqual(sourceHash("Free shipping", ""), sourceHash("Free shipping!", ""));
});

const src = { id: 7, title: "35% off Best Sellers + 40% new Inscription", description: "Use code SPRING35 before 31/12. Min spend $50.", code: "SPRING35" };

test("checkTranslation accepts a faithful translation and tidies em dashes", () => {
  const r = checkTranslation(src, {
    title_es: "35% en los más vendidos — 40% en la nueva Inscription",
    description_es: "Usa el código SPRING35 antes del 31/12. Gasto mínimo $50.",
  });
  assert.deepEqual(r, {
    ok: true,
    title_es: "35% en los más vendidos, 40% en la nueva Inscription",
    description_es: "Usa el código SPRING35 antes del 31/12. Gasto mínimo $50.",
  });
});

test("checkTranslation rejects a lost or changed number, symbol or code, and invented figures", () => {
  const good = { title_es: "35% en los más vendidos y 40% en la nueva Inscription", description_es: "Usa el código SPRING35 antes del 31/12. Gasto mínimo $50." };
  assert.equal(checkTranslation(src, { ...good, title_es: "30% en los más vendidos y 40% en la nueva Inscription" }).ok, false);
  assert.equal(checkTranslation(src, { ...good, title_es: "35 en los más vendidos y 40 en la nueva Inscription" }).ok, false);
  assert.equal(checkTranslation(src, { ...good, description_es: "Usa el código SPRING antes del 31/12. Gasto mínimo $50." }).ok, false);
  assert.equal(checkTranslation(src, { ...good, description_es: "Usa el código SPRING35 antes del 31/12. Gasto mínimo 50 €." }).ok, false);
  assert.equal(checkTranslation(src, { ...good, description_es: "Usa el código SPRING35 antes del 31/12. Gasto mínimo $50. Envío en 24 h." }).ok, false);
  assert.equal(checkTranslation(src, { ...good, title_es: "" }).ok, false);
  assert.equal(checkTranslation(src, { ...good, description_es: "" }).ok, false);
});

test("checkTranslation lets decimal separators and ordinals change", () => {
  const s = { id: 1, title: "€19.99 for your 1st order", description: "", code: "" };
  assert.equal(checkTranslation(s, { title_es: "19,99 € en tu primer pedido", description_es: "" }).ok, true);
});

test("publicText shows the Spanish text only while it matches the current source and isn't 'skip'", () => {
  const base = { title: "Free shipping", description: "On all orders", title_es: "Envío gratis", description_es: "En todos los pedidos" };
  const hash = sourceHash(base.title, base.description);
  assert.deepEqual(publicText({ ...base, translation_status: "auto", translated_from: hash }), { title: "Envío gratis", description: "En todos los pedidos" });
  assert.deepEqual(publicText({ ...base, translation_status: "approved", translated_from: hash }), { title: "Envío gratis", description: "En todos los pedidos" });
  assert.deepEqual(publicText({ ...base, translation_status: "skip", translated_from: hash }), { title: "Free shipping", description: "On all orders" });
  assert.deepEqual(publicText({ ...base, translation_status: "auto", translated_from: "stale" }), { title: "Free shipping", description: "On all orders" });
  // before the columns exist
  assert.deepEqual(publicText({ title: "Free shipping", description: "" }), { title: "Free shipping", description: "" });
});

test("translationInput sends only id, title and conditions", () => {
  assert.equal(translationInput([src]), JSON.stringify([{ id: 7, title: src.title, description: src.description }]));
});

test("parseTranslateArgs: dry run by default, --apply, --limit, --only", () => {
  assert.deepEqual(parseTranslateArgs([]), { apply: false, limit: 100, only: undefined });
  assert.deepEqual(parseTranslateArgs(["--apply", "--limit=5", "--only=12,34"]), { apply: true, limit: 5, only: [12, 34] });
  assert.throws(() => parseTranslateArgs(["--limit=0"]));
  assert.throws(() => parseTranslateArgs(["--only=12,abc"]));
  assert.throws(() => parseTranslateArgs(["--aply"]));
});

test("estimateCost prices output tokens at 5x input, from history or $1 per million input tokens", () => {
  const t = estimateTokens([{ title: "x".repeat(70), description: "y".repeat(280) }]);
  assert.ok(t.input > 700 && t.output > 100);
  assert.equal(inputPriceFrom({ cost: 0, input: 0, output: 0 }), 1e-6);
  assert.equal(inputPriceFrom({ cost: 6, input: 1_000_000, output: 1_000_000 }), 1e-6);
  assert.equal(estimateCost({ input: 1_000_000, output: 0 }, 1e-6), 1);
});
