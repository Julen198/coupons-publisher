import Link from "next/link";
import { eventStoreLinks, type Edition } from "@/lib/campaign-rules";
import { publishedCampaigns, storeClicks30 } from "@/lib/campaign-db";
import { eventCouponsByStore, storeEventPath } from "@/lib/event-pages";
import { daysBetween, longDate } from "@/lib/site-text";
import type { SiteCoupon } from "@/lib/public-site";

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// The store pages of one shopping date (/ofertas/<evento>/<tienda>): on the home page for the date of the week, and on
// the page of the date before it (Black Friday → Cyber Monday). Links are what get the new pages found and read, by
// Google and by the AI assistants' crawlers.
export async function EventStrip({ ed, coupons, today, title }: { ed: Edition; coupons: readonly SiteCoupon[]; today: string; title?: string }) {
  const [campaigns, clicks] = await Promise.all([publishedCampaigns(), storeClicks30()]);
  const live = new Map(coupons.map((c) => [c.store_slug, c.store_name]));
  const written = campaigns.filter((c) => c.event === ed.event.slug && c.year === ed.year && live.has(c.slug)).map((c) => ({ slug: c.slug, name: live.get(c.slug)! }));
  const links = eventStoreLinks(ed.event, eventCouponsByStore(ed.event, coupons, today), written, clicks);
  const left = daysBetween(today, ed.date);
  const day = `${WEEKDAYS[new Date(`${ed.date}T12:00:00Z`).getUTCDay()]} ${longDate(ed.date)}`;
  return (
    <section className="panel" data-seo="Enlazado interno fecha de la semana">
      <h2>
        <Link href={`/ofertas/${ed.event.slug}`}>{title ?? `${ed.event.name} ${ed.year}`}</Link>
      </h2>
      <p className="small">
        {day}. {left > 0 ? `Faltan ${left === 1 ? "1 día" : `${left} días`}.` : "Es hoy."}
      </p>
      {links.length > 0 && (
        <ul className="stores">
          {links.map((s) => (
            <li key={s.slug}>
              <Link href={storeEventPath(ed.event.slug, s.slug)}>
                {ed.event.name} {s.name}
                <small>{s.n ? (s.n === 1 ? "1 cupón" : `${s.n} cupones`) : "guía y cupones"}</small>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/ofertas/${ed.event.slug}`} className="small">Todos los chollos de {ed.event.name}</Link>
    </section>
  );
}
