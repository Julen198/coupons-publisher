# Categories and store facts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Readers browse deals by the prototype's six categories, see 3-level crumbs, and read each store's facts (envío, devoluciones…) as a list in the store guides.

**Architecture:** Each store gets one category and a free-text `facts` field ("Etiqueta | Valor" per line, same format as `faqs`). Coupons inherit the store's category. The home page filters with `?cat=<slug>` like the existing `tipo`, `orden` and `comprobados` filters. Editors set both fields on the store page in the panel.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before touching routing), Postgres via `sql()` from `src/lib/db.ts`, tests with `node --test` (`npm test`).

**Spec:** `docs/superpowers/plans/2026-11-05-prototype-parity-roadmap.md` and the prototype artifact `1823a2f1-a25f-4399-999e-f6ca358b2b8a` (header `.cats`, `.crumbs`, `.store-guides .guide dl`).

## Global Constraints

- Category slugs and labels, in this order: `tecnologia` Tecnología, `zapatillas` Zapatillas, `moda` Moda, `hogar` Hogar, `deporte` Deporte, `viajes` Viajes.
- Schema changes go at the end of `SCHEMA_SQL` in `src/lib/schema.ts` and must be idempotent (`ADD COLUMN IF NOT EXISTS`, drop-then-add constraints).
- No new dependencies. No sample data on the public site.
- Public copy in Spanish, sentence case, no em dashes, no colons mid-sentence.
- Return new objects; do not mutate inputs.

## Review Focus

- A store with no category shows up under "Todos" and in search, and under no category tab.
- An unknown `?cat=` value (typo, old link) behaves like "Todos" and the "Todos" tab is the current one.
- Every filter link (sort tabs, "Solo comprobados", pager, empty-state link) keeps the current `cat`; the category tabs keep `q` cleared and reset `pagina`.
- A `facts` line without `|`, or with an empty side, is skipped instead of rendering an empty row.
- A category with no live deals shows the empty state, not a blank feed.

---

### Task 1: Category list and facts parser

**Files:**
- Create: `src/lib/catalog.ts`
- Test: `src/lib/catalog.test.ts`

**Interfaces:**
- Produces:
  - `CATEGORIES: readonly { slug: CategorySlug; label: string }[]` (the six from Global Constraints, in order)
  - `type CategorySlug = "tecnologia" | "zapatillas" | "moda" | "hogar" | "deporte" | "viajes"`
  - `categoryOf(slug: string): { slug: CategorySlug; label: string } | undefined`
  - `factsOf(text: string): { label: string; value: string }[]`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run** `node --test src/lib/catalog.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `src/lib/catalog.ts`. `factsOf` splits each line on the first `|` only and trims both sides.
- [ ] **Step 4: Run** `node --test src/lib/catalog.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: category list and store facts parser`

### Task 2: Store category and facts in the database and the panel

**Files:**
- Modify: `src/lib/schema.ts` (end of `SCHEMA_SQL`)
- Modify: `src/lib/db.ts` (`Store` type)
- Modify: `src/app/actions.ts` (`updateStore`, around line 342)
- Modify: `src/app/(panel)/stores/[slug]/page.tsx` (props passed to the form, around line 146)
- Modify: `src/app/(panel)/stores/[slug]/store-content-form.tsx`
- Test: `src/lib/catalog.test.ts`

**Interfaces:**
- Consumes: `CATEGORIES`, `categoryOf` (Task 1)
- Produces: columns `stores.category text NOT NULL DEFAULT ''` (CHECK: `''` or one of the six slugs) and `stores.facts text NOT NULL DEFAULT ''`; `Store.category: CategorySlug | ""`, `Store.facts: string`; `storeCategory(raw: string): CategorySlug | ""` exported from `src/lib/catalog.ts`.

- [ ] **Step 1: Write the failing test**

```ts
test("storeCategory keeps a known slug and drops anything else", () => {
  assert.equal(storeCategory("hogar"), "hogar");
  assert.equal(storeCategory(" hogar "), "hogar");
  assert.equal(storeCategory("cocina"), "");
});
```

- [ ] **Step 2: Run** `node --test src/lib/catalog.test.ts`. Expected: FAIL, `storeCategory` not exported.
- [ ] **Step 3: Implement** `storeCategory` in `catalog.ts`; add both columns and the CHECK constraint (`stores_category_check`) to `SCHEMA_SQL`; add the fields to `Store`.
- [ ] **Step 4: Panel.** `updateStore` also sets `category = ${storeCategory(str(f, "category"))}, facts = ${str(f, "facts")}`. The form gets a `<select name="category">` (first option "Sin categoría" with value `""`, then `CATEGORIES`) and a `<textarea name="facts" rows={4}>` labelled "Datos de la tienda" with the hint "Una línea por dato: Envío | Gratis desde 50 €". Put both next to the existing intro and FAQ fields and reuse their `inputCls`.
- [ ] **Step 5: Run** `npm test` and `npm run db:setup` against the dev database. Expected: tests PASS, setup prints no error and runs twice without error.
- [ ] **Step 6: Check by hand** in `npm run dev`: set a category and two facts on one store, save, reload; both values persist.
- [ ] **Step 7: Commit** `feat: store category and facts editable in the panel`

### Task 3: Category navigation, filter and crumbs on the home page

**Files:**
- Modify: `src/lib/public-site.ts` (`SiteCoupon` type and `COUPON_SELECT`)
- Modify: `src/app/(site)/page.tsx` (`Filters`, `readFilters`, `hrefWith`, filtering, crumbs, feed title)
- Modify: `src/app/(site)/site-header.tsx` (`SECTIONS`, `Live`, `Shell`)
- Modify: `src/app/(site)/layout.tsx` (footer links)
- Test: `src/lib/catalog.test.ts`

**Interfaces:**
- Consumes: `CATEGORIES`, `categoryOf` (Task 1), `stores.category` (Task 2)
- Produces: `SiteCoupon.store_category: CategorySlug | ""`; `Filters.cat: CategorySlug | ""`; `homeHref(f: HomeFilters, change: Partial<HomeFilters>): string` moved from `page.tsx` into `src/lib/catalog.ts` so it can be tested, where `HomeFilters = { cat: CategorySlug | ""; tipo: "todos" | "codigos" | "ofertas"; orden: "destacados" | "nuevos" | "ahorro" | "caducan"; comprobados: boolean; q: string; pagina: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

Parameter order in the query string: `q`, `cat`, `tipo`, `orden`, `comprobados`, `pagina`.

- [ ] **Step 2: Run** `node --test src/lib/catalog.test.ts`. Expected: FAIL, `homeHref` not exported.
- [ ] **Step 3: Implement** `homeHref` in `catalog.ts`; `page.tsx` imports it in place of its local `hrefWith`. `readFilters` reads `cat` through `categoryOf(...)?.slug ?? ""` (unknown values become `""`).
- [ ] **Step 4: Data.** `COUPON_SELECT` adds `s.category AS store_category`. The home filter keeps a coupon when `!f.cat || c.store_category === f.cat`. The intro numbers ("Hoy hay N cupones…") keep counting all live coupons, not the filtered ones.
- [ ] **Step 5: Header.** `SECTIONS` becomes "Todos" (`/`) plus the six categories (`/?cat=<slug>`). A tab is current when `path === "/"` and the `cat` search param equals its slug (`""` for Todos). `Live` passes `sp.get("cat")` through to `Shell` in place of `tipo`. The header search form keeps working as now (it submits `q` only).
- [ ] **Step 6: Footer.** Footer right side becomes `Tiendas · Calendario de ofertas · Algunos enlaces son de afiliado`, unchanged, so those two pages stay linked from every page after they leave the header.
- [ ] **Step 7: Crumbs and titles.** Home crumbs become `Inicio` (`/`) / `Chollos` (`/`) / current page. Current page is "Chollos de hoy", or "Chollos de <label>" with a category, for example "Chollos de Tecnología". The feed `<h2>` follows the same rule when there is no search. With a search it stays `Resultados para «q»`. The empty state reads `No hay cupones activos en <label> ahora mismo.` with a category.
- [ ] **Step 8: Run** `npm test` and `npx eslint "src/app/(site)" src/lib/catalog.ts`. Expected: PASS, no lint errors.
- [ ] **Step 9: Check by hand** in `npm run dev` at 1280 px and 390 px. The category tabs scroll horizontally on the phone. `/?cat=moda&orden=nuevos` keeps both. `/?cat=xyz` shows "Todos" as current. A category with no stores shows the empty state.
- [ ] **Step 10: Commit** `feat: browse deals by category from the header`

### Task 4: Store facts in the guides

**Files:**
- Modify: `src/lib/public-site.ts` (`storeGuides`)
- Modify: `src/app/(site)/page.tsx` (guides section)
- Modify: `src/app/(site)/tiendas/[slug]/page.tsx`
- Modify: `src/app/(site)/site.css` (add `.cl .guide dl`, `.cl .guide dt`, `.cl .guide dd` copied from the prototype's `.guide dl/dt/dd` rules)

**Interfaces:**
- Consumes: `factsOf` (Task 1), `stores.facts` (Task 2)
- Produces: `storeGuides(storeIds: number[]): Promise<Pick<Store, "id" | "name" | "slug" | "intro" | "facts">[]>`, returning stores whose `intro` or `facts` is not empty.

- [ ] **Step 1: Data.** `storeGuides` selects `facts` too and changes its filter to `(intro <> '' OR facts <> '')`.
- [ ] **Step 2: Home.** Each `.guide` article renders, in the prototype's order: `<h3>`, then a `<dl>` with `factsOf(g.facts)` (only when there is at least one fact), then `<p>{g.intro}</p>` (only when there is an intro), then the "Ver los N cupones de X" link.
- [ ] **Step 3: Store page.** `tiendas/[slug]` shows the same `<dl>` under its intro, with the same class names so the CSS applies.
- [ ] **Step 4: Run** `npm test` and `npx next build`. Expected: PASS, build succeeds.
- [ ] **Step 5: Check by hand** that a store with facts and no intro shows the list without an empty paragraph, and that one with an intro and no facts looks as it does today.
- [ ] **Step 6: Commit** `feat: store facts list in the store guides`
