import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, categoryOf, missingFacts, withFactTemplate, emptyFeedText, factsOf, hasStoreGuide, homeHref, ordenOf, resetFiltersHref, storeCategory, type HomeFilters } from "./catalog.ts";

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
  assert.equal(homeHref(f, { orden: "nuevos" }), "/categorias/moda?orden=nuevos");
  assert.equal(homeHref(f, { comprobados: true }), "/categorias/moda?comprobados=1");
  assert.equal(homeHref(f, { pagina: 4 }), "/categorias/moda?pagina=4");
});

test("homeHref links the Comentados sort and keeps the other filters", () => {
  assert.equal(homeHref(base, { orden: "comentados" }), "/?orden=comentados");
  assert.equal(homeHref({ ...base, cat: "moda", orden: "comentados", pagina: 2 }, { tipo: "codigos" }), "/categorias/moda?tipo=codigos&orden=comentados");
});

test("ordenOf reads the five sorts from the URL and falls back to Más votados", () => {
  assert.equal(ordenOf("comentados"), "comentados");
  assert.equal(ordenOf("nuevos"), "nuevos");
  assert.equal(ordenOf("caducan"), "caducan");
  assert.equal(ordenOf("destacados"), "destacados");
  assert.equal(ordenOf("Comentados"), "destacados");
  assert.equal(ordenOf(""), "destacados");
});

test("homeHref keeps a search on the home page, with its category as a filter", () => {
  assert.equal(homeHref({ ...base, q: "nike", cat: "moda" }, {}), "/?q=nike&cat=moda");
});

test("homeHref for a category tab drops the search", () => {
  assert.equal(homeHref({ ...base, q: "nike" }, { cat: "deporte", q: "" }), "/categorias/deporte");
  assert.equal(homeHref({ ...base, cat: "deporte" }, { cat: "" }), "/");
});

test("hasStoreGuide needs an intro or at least one valid fact", () => {
  assert.equal(hasStoreGuide({ intro: "", facts: "Envío gratis desde 50 €" }), false);
  assert.equal(hasStoreGuide({ intro: "  ", facts: "" }), false);
  assert.equal(hasStoreGuide({ intro: "", facts: "Envío | Gratis" }), true);
  assert.equal(hasStoreGuide({ intro: "Tienda de Fráncfort.", facts: "" }), true);
});

test("resetFiltersHref keeps the category when other filters emptied the feed", () => {
  assert.equal(resetFiltersHref({ ...base, cat: "moda", comprobados: true }), "/categorias/moda");
  assert.equal(resetFiltersHref({ ...base, cat: "moda", q: "nike", orden: "nuevos" }), "/categorias/moda");
  assert.equal(resetFiltersHref({ ...base, cat: "moda" }), "/");
  assert.equal(resetFiltersHref({ ...base, comprobados: true }), "/");
});

test("emptyFeedText names what emptied the feed and links back to the full list", () => {
  assert.deepEqual(emptyFeedText({ ...base, q: "nike" }, "Moda"), {
    title: "No hay chollos para «nike»",
    hint: "Prueba con otra búsqueda.",
    link: { href: "/", label: "Ver todos los chollos" },
  });
  assert.deepEqual(emptyFeedText({ ...base, cat: "moda", comprobados: true }, "Moda"), {
    title: "No hay chollos con estos filtros",
    hint: "Prueba con otra categoría o quita «Solo comprobados».",
    link: { href: "/categorias/moda", label: "Ver todos los chollos de Moda" },
  });
  assert.deepEqual(emptyFeedText({ ...base, cat: "viajes" }, "Viajes"), {
    title: "No hay chollos de Viajes ahora mismo",
    hint: "Prueba con otra categoría.",
    link: { href: "/", label: "Ver todos los chollos" },
  });
  assert.deepEqual(emptyFeedText(base, ""), { title: "No hay chollos ahora mismo", hint: "Publicamos cupones nuevos cada día.", link: null });
});

test("missingFacts and withFactTemplate: the key facts still to fill in, never guessed", () => {
  assert.deepEqual(missingFacts(""), ["Envío", "Devoluciones", "Códigos por pedido", "Formas de pago"]);
  assert.deepEqual(missingFacts("Envío | Gratis desde 50 €\nDevoluciones | \nCódigos por pedido | 1"), ["Devoluciones", "Formas de pago"]);
  assert.equal(withFactTemplate("Envío | Gratis desde 50 €"), "Envío | Gratis desde 50 €\nDevoluciones | \nCódigos por pedido | \nFormas de pago | ");
  // an empty line adds nothing to the page
  assert.deepEqual(factsOf(withFactTemplate("")), []);
});
