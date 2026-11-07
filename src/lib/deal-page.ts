// The deal page's "Condiciones de la oferta" rows and "Preguntas sobre este chollo". Pure, so it tests without a database.
import { longDate } from "./site-text.ts";

type Fact = { label: string; value: string };

// the board's order for the store facts; any other fact follows them
const FACT_ORDER = ["envío", "devoluciones", "códigos por pedido", "formas de pago"];

export function offerConditions(o: { badge: string; wordBadge: boolean; code: string; expiresAt: string | null; conds: string[]; facts: Fact[] }): [string, string][] {
  const hasCode = !!o.code;
  const discount = o.wordBadge ? (hasCode ? `Con el código ${o.code}` : "Oferta sin código") : `${o.badge}${hasCode ? ` con el código ${o.code}` : ", sin código"}`;
  // stock only limits deals; a code lasts until its date
  const until = o.expiresAt ? `${longDate(o.expiresAt)}${hasCode ? "" : " o hasta agotar existencias"}` : "Sin fecha de caducidad anunciada";
  const rank = (f: Fact) => {
    const i = FACT_ORDER.findIndex((p) => f.label.toLowerCase().startsWith(p));
    return i < 0 ? FACT_ORDER.length : i;
  };
  const facts = o.facts.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map(({ f }): [string, string] => [f.label, f.value]);
  return [["Descuento", discount], ["Válido hasta", until], ...facts, ...(o.conds.length ? [["Otras condiciones", o.conds.join(" · ")] as [string, string]] : [])];
}

function combineAnswer(store: string, codesPerOrder: string): string {
  const v = codesPerOrder.trim();
  if (!v) return "Casi nunca. La mayoría de tiendas admiten un solo código por pedido, salvo que sus condiciones digan otra cosa.";
  if (v === "1") return `No. ${store} admite un solo código por pedido.`;
  if (/^\d+$/.test(v)) return `${store} admite hasta ${v} códigos por pedido.`;
  return `Lo que indica ${store} es «${v}».`;
}

// Generic, true answers about using this coupon; the store's own FAQs go after them
export function dealFaqs(o: { store: string; code: string; expiresAt: string | null; live: boolean; codesPerOrder: string }): { q: string; a: string }[] {
  const what = o.code ? "este código" : "esta oferta";
  if (!o.live)
    return [{ q: `¿Sigue funcionando ${what}?`, a: `No. ${o.expiresAt ? `Caducó el ${longDate(o.expiresAt)}.` : "Ya no está activo."} En la página de ${o.store} tienes los cupones que siguen activos.` }];
  const until = o.expiresAt
    ? `Hasta el ${longDate(o.expiresAt)}${o.code ? "" : " o hasta que se agoten las existencias"}. Al día siguiente sale de la portada y su página pasa a «Caducado».`
    : "La tienda no ha anunciado fecha de caducidad. Si deja de funcionar, avísanos con «Marcar como caducado».";
  const validity = { q: `¿Hasta cuándo vale ${what}?`, a: until };
  if (!o.code)
    return [validity, { q: "¿Hace falta un código para esta oferta?", a: `No. El descuento ya está aplicado en la web de ${o.store}. Entra desde «Ir a ${o.store}» y comprueba el total antes de pagar.` }];
  return [
    validity,
    { q: `¿Puedo usar ${o.code} junto con otro código?`, a: combineAnswer(o.store, o.codesPerOrder) },
    { q: `¿Dónde pego el código ${o.code}?`, a: `En el campo de código descuento o cupón del carrito de ${o.store}, antes de pagar. El descuento aparece en el total antes de confirmar el pedido.` },
  ];
}
