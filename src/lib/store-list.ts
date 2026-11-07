// How a store is summed up in lists: its best discount (/tiendas) and the heading of its guide on the home page
import { badgeLabel } from "./discount.ts";
import { savingOf } from "./site-text.ts";

const eurosOf = (badge: string) => {
  const m = badge.match(/(\d+(?:[.,]\d+)?)\s?€/);
  return m ? Number(m[1].replace(",", ".")) : 0;
};

// "15 % con código", "Hasta 70 %", "10 €"…; "" when no coupon of the store carries a figure or a short badge
export function bestDiscountLine(coupons: readonly { discount: string; kind: string }[]): string {
  const ranked = coupons
    .map((c) => ({ c, badge: badgeLabel(c.discount) }))
    .filter((x) => x.badge)
    .sort((a, b) => savingOf(b.c.discount) - savingOf(a.c.discount) || eurosOf(b.badge) - eurosOf(a.badge));
  const best = ranked[0];
  if (!best) return "";
  return best.c.kind === "code" ? `${best.badge} con código` : best.badge;
}

// "Códigos descuento X" when the store has codes, "Ofertas X" when it only has offers, and the link to all of them
export function guideLabels(name: string, total: number, codes: number): { heading: string; link: string } {
  if (codes === 0) return { heading: `Ofertas ${name}`, link: total === 1 ? `Ver la oferta de ${name}` : `Ver las ${total} ofertas de ${name}` };
  const heading = `Códigos descuento ${name}`;
  if (codes === total) return { heading, link: total === 1 ? `Ver el código de ${name}` : `Ver los ${total} códigos de ${name}` };
  return { heading, link: `Ver los ${total} cupones de ${name}` };
}
