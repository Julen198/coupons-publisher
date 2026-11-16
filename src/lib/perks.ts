// Standing offers and real check dates: what the coupon sites that outrank us show on a store page (a dozen coupons
// per store, many of them offers that never expire, and the day each one was last checked). Pure, so it tests
// without a database. The columns (coupons.perk, coupons.checked_at) arrive with SCHEMA_SQL; until then they read
// as missing and everything here treats the coupon as an ordinary, never-dated one.
import { columnGuard } from "./tracking-columns.ts";
import { shortDate } from "./site-text.ts";

// The kinds of standing offer a store can have. The label is what the card says; never invent one: each comes from
// the store's own website, checked by an editor.
export const PERKS = [
  { slug: "bienvenida", label: "Bienvenida", hint: "Descuento de bienvenida o en la primera compra" },
  { slug: "newsletter", label: "Newsletter", hint: "Código por suscribirte a la newsletter" },
  { slug: "app", label: "App", hint: "Descuento por comprar en la app" },
  { slug: "estudiantes", label: "Estudiantes", hint: "Descuento para estudiantes" },
  { slug: "envio", label: "Envío gratis", hint: "Envío gratis permanente o desde un importe" },
  { slug: "otra", label: "Ventaja fija", hint: "Otra ventaja que la tienda mantiene siempre" },
] as const;

export type PerkSlug = (typeof PERKS)[number]["slug"];

export const perkOf = (slug: string | null | undefined) => PERKS.find((p) => p.slug === slug);
// A form field: a known slug, or "" (an ordinary coupon)
export const perkInput = (raw: string): PerkSlug | "" => perkOf(raw.trim())?.slug ?? "";
export const isPerk = (c: { perk?: string | null }) => !!perkOf(c.perk);

// Feeds of chollos (home, events, Telegram) leave standing offers out: they are not news, and they would sit on top
// of «Nuevos» for ever. They show on their store's pages.
export const withoutPerks = <T extends { perk?: string | null }>(list: readonly T[]): T[] => list.filter((c) => !isPerk(c));

// coupons.checked_at and coupons.perk, written ahead of their migration (see columnGuard)
export const couponFreshnessColumns = columnGuard(/\b(checked_at|perk)\b/);
// stores.title_term
export const titleTermColumn = columnGuard(/\btitle_term\b/);

// The Madrid day a check happened, "" = never
export function checkedDay(at: Date | string | null | undefined): string {
  if (!at) return "";
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}

// "Comprobado hoy" / "Comprobado ayer" / "Comprobado el 3 nov" — a date only when there was a real check
export function checkedLabel(day: string, today: string): string {
  if (!day) return "Comprobado";
  if (day === today) return "Comprobado hoy";
  const y = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return day === y ? "Comprobado ayer" : `Comprobado el ${shortDate(day)}`;
}

// The latest check among a store's coupons ("" = none dated yet)
export const lastChecked = (list: readonly { checked_at?: Date | string | null }[]): string =>
  list.map((c) => checkedDay(c.checked_at)).reduce((a, b) => (b > a ? b : a), "");
