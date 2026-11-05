import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, categoryOf, factsOf, homeHref, storeCategory, type HomeFilters } from "./catalog.ts";

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

test("storeCategory keeps a known slug and drops anything else", () => {
  assert.equal(storeCategory("hogar"), "hogar");
  assert.equal(storeCategory(" hogar "), "hogar");
  assert.equal(storeCategory("cocina"), "");
});

const base: HomeFilters = { cat: "", tipo: "todos", orden: "destacados", comprobados: false, q: "", pagina: 1 };

test("homeHref keeps the category on every filter link and resets the page", () => {
  const f = { ...base, cat: "moda" as const, pagina: 3 };
  assert.equal(homeHref(f, { orden: "nuevos" }), "/?cat=moda&orden=nuevos");
  assert.equal(homeHref(f, { comprobados: true }), "/?cat=moda&comprobados=1");
  assert.equal(homeHref(f, { pagina: 4 }), "/?cat=moda&pagina=4");
});

test("homeHref for a category tab drops the search", () => {
  assert.equal(homeHref({ ...base, q: "nike" }, { cat: "deporte", q: "" }), "/?cat=deporte");
  assert.equal(homeHref({ ...base, cat: "deporte" }, { cat: "" }), "/");
});
