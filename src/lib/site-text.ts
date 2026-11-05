// Pure helpers for the public deals site (no DB), so they can be unit-tested.
import { discountBadge } from "./discount.ts";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Our public origin for canonical URLs, JSON-LD and the sitemap
export function siteUrl(): string {
  const own = process.env.SITE_URL?.replace(/\/+$/, "");
  if (own) return own;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

// "Código 15% en 43einhalb" → "codigo-15-en-43einhalb"
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
}

// /chollos/123-codigo-descuento-43einhalb-15: the id leads, the words are for readers and search engines
export const dealPath = (c: { id: number; title: string; store_name: string }) => {
  const words = slugify(`${c.store_name} ${c.title}`);
  return `/chollos/${c.id}${words ? `-${words}` : ""}`;
};

export function parseDealId(param: string): number | null {
  const m = /^(\d+)(?:-|$)/.exec(param);
  const id = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// "2026-11-12" → "12 de noviembre de 2026"
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

// Today in Spain as "YYYY-MM-DD" and as words, whatever the server's timezone
export function madridToday(now = new Date()): { iso: string; words: string } {
  const iso = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  return { iso, words: longDate(iso) };
}

// The figure a discount is worth for ranking: "15%" → 15, "Hasta 70%" → 70, anything else → 0
export function percentOf(discount: string): number {
  const m = discountBadge(discount).match(/(\d+(?:[.,]\d+)?)\s?%/);
  return m ? Number(m[1].replace(",", ".")) : 0;
}

// Shopping dates readers plan around. Black Friday = the day after the fourth Thursday of November.
export function blackFriday(year: number): string {
  const first = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0 = Sunday
  const firstThursday = 1 + ((4 - first + 7) % 7);
  const day = firstThursday + 21 + 1;
  return `${year}-11-${String(day).padStart(2, "0")}`;
}

export type ShopEvent = { date: string; name: string; note: string };

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Día de la Madre in Spain: the first Sunday of May
export function mothersDay(year: number): string {
  const first = new Date(Date.UTC(year, 4, 1)).getUTCDay();
  return iso(year, 5, 1 + ((7 - first) % 7));
}

export function eventsOf(year: number): ShopEvent[] {
  const bf = blackFriday(year);
  const cyber = new Date(Date.parse(bf) + 3 * 86_400_000).toISOString().slice(0, 10);
  return [
    { date: iso(year, 1, 6), name: "Reyes", note: "Último día para los regalos. Las rebajas empiezan al día siguiente" },
    { date: iso(year, 1, 7), name: "Rebajas de enero", note: "Empiezan en casi todas las tiendas de moda y hogar" },
    { date: iso(year, 2, 14), name: "San Valentín", note: "Perfumería, joyería, experiencias y restaurantes" },
    { date: iso(year, 3, 19), name: "Día del Padre", note: "Tecnología, deporte y moda de hombre" },
    { date: mothersDay(year), name: "Día de la Madre", note: "Perfumería, belleza, moda y joyería" },
    { date: iso(year, 7, 1), name: "Rebajas de verano", note: "Moda y hogar, hasta finales de agosto" },
    { date: iso(year, 11, 11), name: "Día del Soltero", note: "Descuentos en AliExpress, moda y tecnología" },
    { date: bf, name: `Black Friday ${year}`, note: "Muchas tiendas adelantan ofertas toda la semana" },
    { date: cyber, name: "Cyber Monday", note: "Sobre todo tecnología" },
    { date: iso(year, 12, 25), name: "Navidad", note: "Revisa el último día de envío de cada tienda" },
  ];
}

// The next `count` dates from today on
export function upcomingEvents(todayIso: string, count = 3): ShopEvent[] {
  const year = Number(todayIso.slice(0, 4));
  return [...eventsOf(year), ...eventsOf(year + 1)].filter((e) => e.date >= todayIso).slice(0, count);
}

export const daysBetween = (fromIso: string, toIso: string) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
