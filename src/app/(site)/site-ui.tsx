import Link from "next/link";
import type { Client } from "@/lib/db";
import { factsOf } from "@/lib/catalog";
import { badgeLabel } from "@/lib/discount";
import { conditionsOf, displayTitle } from "@/lib/deal-text";
import { copyBeaconHref, goHref, type SiteCoupon } from "@/lib/public-site";
import { mayHaveExpired, timeAgo } from "@/lib/community";
import { httpsImage } from "@/lib/networks/types";
import { daysBetween, dealPath, shortDate } from "@/lib/site-text";
import { vote } from "./actions-reader";
import { CopyCode } from "./copy-code";
import { DealImg, StoreLogoImg } from "./store-logo-img";
import { ArrowIcon } from "./entrar/icons";

export const badgeOf = (c: Pick<SiteCoupon, "discount" | "kind">) => badgeLabel(c.discount) || (c.kind === "code" ? "Código" : "Oferta");
// No figure to show: the badge is just the word "Oferta" or "Código", set as small text instead of a big price
export const isWordBadge = (c: Pick<SiteCoupon, "discount">) => !badgeLabel(c.discount);
export const priceClass = (c: Pick<SiteCoupon, "discount">) => (isWordBadge(c) ? "price-now is-word" : "price-now");
// The title readers see, next to its store
// display_title carries the known brands (see public-site); rows without it fall back to the store alone
export const titleOf = (c: Pick<SiteCoupon, "title" | "store_name"> & { display_title?: string }) => c.display_title || displayTitle(c.title, c.store_name);
// The deal's product picture ("" = none, show the store logo); checked again here since it came from a network feed
export const productImageOf = (c: Pick<SiteCoupon, "image_url">) => httpsImage(c.image_url);

// Product image when the deal has one, else the store logo (its wordmark with `wordmark`: the frames with room for it)
export function DealPicture({ c, wordmark = false }: { c: SiteCoupon; wordmark?: boolean }) {
  return <DealImg src={productImageOf(c)} title={titleOf(c)} slug={c.store_slug} name={c.store_name} hasLogo={c.store_has_logo} hasWordmark={wordmark && !!c.store_has_wordmark} />;
}

// Structured data for search engines and AI answers
export function JsonLd({ data }: { data: unknown }) {
  // "<" escaped so a title can never close the script tag
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function Crumbs({ items, seo = "BreadcrumbList" }: { items: { name: string; href?: string }[]; seo?: string }) {
  return (
    <nav className="crumbs" aria-label="Migas de pan" data-seo={seo}>
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
      {mayHaveExpired(c.expiry_reports ?? 0) && <span className="badge b-low">Puede haber caducado</span>}
    </>
  );
}

// Affiliate links: sponsored for search engines, new tab for readers. source = the page or campaign the button is on,
// so the click is counted under that origin (see clickSource)
export function GoButton({ client, c, label, source }: { client: Client | undefined; c: SiteCoupon; label?: string; source?: string }) {
  return (
    <a className="btn btn-primary go-btn" href={goHref(client, c, source)} target="_blank" rel="sponsored nofollow noopener">
      {label ?? `Ir a ${c.store_name}`}
      <ArrowIcon />
    </a>
  );
}

export function StoreThumb({ c, className = "thumb", href }: { c: SiteCoupon; className?: string; href?: string }) {
  const img = <DealPicture c={c} wordmark />;
  return href ? (
    <Link className={className} href={href} title={productImageOf(c) ? titleOf(c) : c.store_name}>
      {img}
    </Link>
  ) : (
    <div className={className}>{img}</div>
  );
}

const EXPIRED_VOTE_TITLE = "Este chollo ha caducado";

// Vote column from the prototype. A real form, so it works without client JS; signed-out readers are sent to sign in.
export function VoteColumn({ couponId, score, mine, next, readOnly = false }: { couponId: number; score: number; mine: -1 | 0 | 1; next: string; readOnly?: boolean }) {
  const arrow = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  return (
    <form className="vote" action={vote} role="group" aria-label="Votos">
      <input type="hidden" name="coupon_id" value={couponId} />
      <input type="hidden" name="next" value={next} />
      <button className="up" type="submit" name="value" value="1" aria-pressed={mine === 1} aria-label="Buen chollo" disabled={readOnly} title={readOnly ? EXPIRED_VOTE_TITLE : undefined}>
        <svg {...arrow}><path d="m6 15 6-6 6 6" /></svg>
      </button>
      <span className="score">{score > 0 ? `+${score}` : score}</span>
      <button className="down" type="submit" name="value" value="-1" aria-pressed={mine === -1} aria-label="No es chollo" disabled={readOnly} title={readOnly ? EXPIRED_VOTE_TITLE : undefined}>
        <svg {...arrow}><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </form>
  );
}

// hideStore: on the store's own page the card leaves out its logo and name; viewerHandle: the signed-in reader's @handle;
// source: the origin its clicks and copies count under
type CardProps = { c: SiteCoupon; client: Client | undefined; today: string; now: Date; mine: Map<number, -1 | 1>; next: string; hideStore?: boolean; viewerHandle?: string | null; source?: string };

// "@handle" in a card's foot: a link to the reader's own account when it is theirs (there are no public profiles)
function SharedBy({ handle, viewerHandle }: { handle: string; viewerHandle?: string | null }) {
  return handle === viewerHandle ? <Link href="/cuenta">@{handle}</Link> : <>@{handle}</>;
}

export function DealCard({ c, client, today, now, mine, next, hideStore = false, viewerHandle, source }: CardProps) {
  const conds = conditionsOf(c.description, c.title).slice(0, 3);
  return (
    <article className="deal">
      <VoteColumn couponId={c.id} score={c.score} mine={mine.get(c.id) ?? 0} next={next} />
      <StoreThumb c={c} href={dealPath(c)} />
      <div className="deal-main">
        <div className="deal-head">
          {!hideStore && (
            <Link className="store" href={`/tiendas/${c.store_slug}`}>
              <StoreLogoImg slug={c.store_slug} name={c.store_name} hasLogo={c.store_has_logo} className="slogo" />
              {c.store_name}
            </Link>
          )}
          <StatusBadges c={c} today={today} />
        </div>
        <h3>
          <Link href={dealPath(c)}>{titleOf(c)}</Link>
        </h3>
        <div className="deal-body">
          <div>
            <div className="prices">
              <span className={priceClass(c)}>{badgeOf(c)}</span>
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
            {c.kind === "code" && c.code && <CopyCode code={c.code} beacon={copyBeaconHref(client, c, source)} />}
            <GoButton client={client} c={c} source={source} />
          </div>
        </div>
      </div>
      {/* as in the prototype: who and when, comments, then until when */}
      <div className="deal-foot">
        <span>
          {c.shared_by_handle ? <>Compartido por <SharedBy handle={c.shared_by_handle} viewerHandle={viewerHandle} /> · </> : "Publicado "}{timeAgo(new Date(c.created_at), now)}
        </span>
        <Link href={`${dealPath(c)}#comentarios`}>{c.comments === 1 ? "1 comentario" : `${c.comments} comentarios`}</Link>
        <span>{c.expires_at ? <>Válido hasta el <time dateTime={c.expires_at}>{shortDate(c.expires_at)}</time></> : "Sin fecha de caducidad"}</span>
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

export function Faqs({ items, seo = "FAQPage" }: { items: { q: string; a: string }[]; seo?: string }) {
  return (
    <div className="faq" data-seo={seo}>
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
  name: titleOf(c),
  description: [badgeOf(c), ...conditionsOf(c.description, c.title)].join(". "),
  url: base + dealPath(c),
  ...(c.expires_at ? { validThrough: `${c.expires_at}T23:59:59+01:00` } : {}),
  availability: live ? "https://schema.org/InStock" : "https://schema.org/Discontinued",
  ...(productImageOf(c) ? { image: productImageOf(c) } : {}),
  seller: { "@type": "Organization", name: c.store_name, url: c.store_website },
});
