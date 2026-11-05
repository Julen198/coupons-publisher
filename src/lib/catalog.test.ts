import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, categoryOf, factsOf } from "./catalog.ts";

test("categoryOf knows the six categories and nothing else", () => {
  assert.deepEqual(CATEGORIES.map((c) => c.slug), ["tecnologia", "zapatillas", "moda", "hogar", "deporte", "viajes"]);
  assert.equal(categoryOf("moda")?.label, "Moda");
  assert.equal(categoryOf("Moda"), undefined);
  assert.equal(categoryOf(""), undefined);
});

test("factsOf reads one 'Etiqueta | Valor' per line and skips the rest", () => {
  const text = "Envío a España | Gratis desde 150 €\nsin barra\n | vacío\nDevoluciones|14 días\n\nCódigos por pedido | 1 | extra";
  assert.deepEqual(factsOf(text), [
    { label: "Envío a España", value: "Gratis desde 150 €" },
    { label: "Devoluciones", value: "14 días" },
    { label: "Códigos por pedido", value: "1 | extra" },
  ]);
});
