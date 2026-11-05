import Link from "next/link";
import type { Client } from "@/lib/db";
import { factsOf } from "@/lib/catalog";
import { discountBadge } from "@/lib/discount";
import { goHref, type SiteCoupon } from "@/lib/public-site";
import { daysBetween, dealPath, longDate } from "@/lib/site-text";
import { vote } from "./actions-reader";
import { CopyCode } from "./copy-code";
import { StoreLogoImg } from "./store-logo-img";

export const badgeOf = (c: Pick<SiteCoupon, "discount" | "kind">) => discountBadge(c.discount) || (c.kind === "code" ? "Código" : "Oferta");

// "No válido en lanzamientos. Pedido mínimo 50 €." → ["No válido en lanzamientos", "Pedido mínimo 50 €"]
export const conditionsOf = (description: string) =>
  description
    .split(/(?<=[.;])\s+|\n+/)
    .map((s) => s.trim().replace(/[.;]$/, ""))
    .filter(Boolean);

const madridDate = (d: Date) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const shortDate = (iso: string) => longDate(iso).replace(/ de \d{4}$/, "");

// Structured data for search engines and AI answers
export function JsonLd({ data }: { data: unknown }) {
  // "<" escaped so a title can never close the script tag
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function Crumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Migas de pan">
      {items.map((it, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {it.href ? <Link href={it.href}>{it.name}</Link> : <span aria-current="page">{it.name}</span>}
        </span>
      ))}
    </nav>
  );
}

export function StatusBadges({ c, today, live = true }: { c: SiteCoupon; today: string; live?: boolean }) {
  if (!live) return <span className="badge b-exp">Caducado el {shortDate(c.expires_at)}</span>;
  const left = c.expires_at ? daysBetween(today, c.expires_at) : null;
  return (
    <>
      {c.verified ? <span className="badge b-ok">Comprobado</span> : null}
      {left !== null && left <= 7 && (
        <span className="badge b-low">{left <= 0 ? "Caduca hoy" : left === 1 ? "Caduca mañana" : `Caduca en ${left} días`}</span>
      )}
    </>
  );
}

// Affiliate links: sponsored for search engines, new tab for readers
export function GoButton({ client, c, label }: { client: Client | undefined; c: SiteCoupon; label?: string }) {
  return (
    <a className="btn btn-primary" href={goHref(client, c)} target="_blank" rel="sponsored nofollow noopener">
      {label ?? `Ir a ${c.store_name}`} ↗
    </a>
  );
}

export function StoreThumb({ c, className = "thumb", href }: { c: SiteCoupon; className?: string; href?: string }) {
  const img = <StoreLogoImg slug={c.store_slug} name={c.store_name} hasLogo={c.store_has_logo} />;
  return href ? (
    <Link className={className} href={href} title={c.store_name}>
      {img}
    </Link>
  ) : (
    <div className={className}>{img}</div>
  );
}

// Vote column from the prototype. A real form, so it works without client JS; signed-out readers are sent to sign in.
export function VoteColumn({ couponId, score, mine, next }: { couponId: number; score: number; mine: -1 | 0 | 1; next: string }) {
  const arrow = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  return (
    <form className="vote" action={vote} aria-label="Votos">
      <input type="hidden" name="coupon_id" value={couponId} />
      <input type="hidden" name="next" value={next} />
      <button className="up" type="submit" name="value" value="1" aria-pressed={mine === 1} aria-label="Buen chollo">
        <svg {...arrow}><path d="m6 15 6-6 6 6" /></svg>
      </button>
      <span className="score">{score > 0 ? `+${score}` : score}</span>
      <button className="down" type="submit" name="value" value="-1" aria-pressed={mine === -1} aria-label="No es chollo">
        <svg {...arrow}><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </form>
  );
}

type CardProps = { c: SiteCoupon; client: Client | undefined; today: string; mine: Map<number, -1 | 1>; next: string };

export function DealCard({ c, client, today, mine, next }: CardProps) {
  const conds = conditionsOf(c.description).slice(0, 3);
  return (
    <article className="deal">
      <VoteColumn couponId={c.id} score={c.score} mine={mine.get(c.id) ?? 0} next={next} />
      <StoreThumb c={c} href={dealPath(c)} />
      <div className="deal-main">
        <div className="deal-head">
          <Link className="store" href={`/tiendas/${c.store_slug}`}>
            <StoreLogoImg slug={c.store_slug} name={c.store_name} hasLogo={c.store_has_logo} className="slogo" />
            {c.store_name}
          </Link>
          <StatusBadges c={c} today={today} />
        </div>
        <h3>
          <Link href={dealPath(c)}>{c.title}</Link>
        </h3>
        <div className="deal-body">
          <div>
            <div className="prices">
              <span className="price-now">{badgeOf(c)}</span>
              <span className="price-kind">{c.kind === "code" ? "con código" : "sin código"}</span>
            </div>
            {conds.length > 0 && (
              <ul className="conds">
                {conds.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="cta">
            {c.kind === "code" && c.code && <CopyCode code={c.code} />}
            <GoButton client={client} c={c} />
          </div>
        </div>
      </div>
      <div className="deal-foot">
        <span>Publicado el {shortDate(madridDate(c.created_at))}</span>
        <span>{c.expires_at ? <>Válido hasta el <time dateTime={c.expires_at}>{shortDate(c.expires_at)}</time></> : "Sin fecha de caducidad"}</span>
        <Link href={dealPath(c)}>Ver condiciones</Link>
      </div>
    </article>
  );
}

// A store's short facts (envío, devoluciones…) as a definition list; nothing when it has none
export function StoreFacts({ text }: { text: string }) {
  const facts = factsOf(text);
  if (!facts.length) return null;
  return (
    <dl className="facts">
      {facts.map((x, i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>{x.label}</dt>
          <dd>{x.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Faqs({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="faq">
      {items.map((f, i) => (
        <details key={i} open={i === 0}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export const faqLd = (items: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

export const crumbsLd = (base: string, items: { name: string; href?: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, ...(it.href ? { item: base + it.href } : {}) })),
});

// schema.org Offer for a coupon: what, who sells, until when
export const offerLd = (base: string, c: SiteCoupon, live = true) => ({
  "@context": "https://schema.org",
  "@type": "Offer",
  name: c.title,
  description: [badgeOf(c), c.description].filter(Boolean).join(". "),
  url: base + dealPath(c),
  ...(c.expires_at ? { validThrough: `${c.expires_at}T23:59:59+01:00` } : {}),
  availability: live ? "https://schema.org/InStock" : "https://schema.org/Discontinued",
  seller: { "@type": "Organization", name: c.store_name, url: c.store_website },
});
