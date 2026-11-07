# Prototype parity roadmap

Goal: the public home page (`src/app/(site)/page.tsx`) matches the approved prototype 1:1
(artifact `1823a2f1-a25f-4399-999e-f6ca358b2b8a`, "CuponLab Chollos"), backed by real data. No sample data on the public site.

## Decisions taken (2026-11-05)

- Prices come from the networks' **product feeds** (Awin, CJ, Rakuten, Impact). One price row per product per day gives the history and the 90-day minimum. Access to each advertiser's feed has to be requested in each network.
- Votes, comments and "Compartir chollo" need a **reader account**: sign-in by magic link (the panel already has one, `src/lib/magic-link.ts`). Shared deals wait for moderation before they go live.
- Categories are the prototype's six: Tecnología, Zapatillas, Moda, Hogar, Deporte, Viajes.

## Already matched (commit after 975e85f)

Colours, type, header, intro, grid, rail, card styling, FAQ, author box, "Mayor ahorro" tab, rail calendar (only Black Friday highlighted), small "Ver las N tiendas" link, and the discount parser no longer reads "99,99 %" product specs as discounts.

## Sub-projects, in order

Each one ships on its own and has its own plan in this folder.

| # | Plan | Prototype pieces it delivers | Depends on |
|---|------|------------------------------|------------|
| 1 | `2026-11-05-catalog-categories-store-facts.md` | Category nav in the header, 3-level crumbs, store guide facts (`<dl>` with envío, devoluciones…) | nothing |
| 2 | Product feeds and prices (to write after 1) | Price now / was / %, sparkline, "Mínimo 90 días", "Precio mínimo 90 días" badge and filter, product image, comparison table "Dónde está más barato…", "Comprobado HH:MM", "Próxima comprobación", methodology steps about price history | feed access in each network |
| 3 | Reader accounts and community (to write after 2) | Vote column, "Más votados" tab, comments count and thread, "Compartido por @usuario · hace 3 h", "Compartir chollo" button and form, moderation queue in the panel, 4th methodology step | 1 |
| 4 | Price alerts (to write after 3) | "Avísame si baja de precio" form in the rail, "Avísame si vuelve" on expired deals, alert emails | 2 and 3 |

Not built: the "Ver SEO/GEO" button and drawer. They exist only to annotate the prototype.
