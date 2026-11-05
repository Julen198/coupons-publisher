import Link from "next/link";
import type { Client } from "@/lib/db";
import { discountBadge } from "@/lib/discount";
import { goHref, type SiteCoupon } from "@/lib/public-site";
import { daysBetween, dealPath, longDate } from "@/lib/site-text";
import { StoreMark } from "@/app/store-mark";
import { CopyCode } from "./copy-code";

export const badgeOf = (c: Pick<SiteCoupon, "discount" | "kind">) => discountBadge(c.discount) || (c.kind === "code" ? "Código" : "Oferta");

// Structured data for search engines and AI answers
export function JsonLd({ data }: { data: unknown }) {
  // "<" escaped so a title can never close the script tag
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function Crumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Migas de pan" className="flex flex-wrap gap-1.5 text-sm text-slate-500 dark:text-slate-400">
      {items.map((it, i) => (
        <span key={i} className="flex gap-1.5">
          {i > 0 && <span aria-hidden="true">/</span>}
          {it.href ? (
            <Link href={it.href} className="text-slate-700 hover:underline dark:text-slate-300">{it.name}</Link>
          ) : (
            <span aria-current="page">{it.name}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function StatusBadges({ c, today, live = true }: { c: SiteCoupon; today: string; live?: boolean }) {
  if (!live) return <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Caducado</span>;
  const left = c.expires_at ? daysBetween(today, c.expires_at) : null;
  return (
    <>
      {c.verified ? <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-bold text-green-800 dark:bg-green-950 dark:text-green-300">Comprobado</span> : null}
      {left !== null && left <= 7 && (
        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
          {left <= 0 ? "Caduca hoy" : left === 1 ? "Caduca mañana" : `Caduca en ${left} días`}
        </span>
      )}
    </>
  );
}

// Affiliate links: sponsored for search engines, new tab for readers
export function GoButton({ client, c, full = false, label }: { client: Client | undefined; c: SiteCoupon; full?: boolean; label?: string }) {
  return (
    <a
      href={goHref(client, c)}
      target="_blank"
      rel="sponsored nofollow noopener"
      className={`inline-flex items-center justify-center gap-1 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 ${full ? "w-full" : ""}`}
    >
      {label ?? `Ir a ${c.store_name}`} <span aria-hidden="true">↗</span>
    </a>
  );
}

export function DealCard({ c, client, today }: { c: SiteCoupon; client: Client | undefined; today: string }) {
  const badge = badgeOf(c);
  return (
    <article className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[96px_minmax(0,1fr)_200px] dark:border-slate-800 dark:bg-slate-900">
      <Link href={dealPath(c)} className="flex aspect-square flex-col items-center justify-center gap-1 rounded border border-slate-200 bg-white text-center dark:border-slate-700" aria-label={`${badge} en ${c.store_name}`}>
        <StoreMark slug={c.store_slug} name={c.store_name} hasLogo={c.store_has_logo} size="md" />
        <span className={`font-extrabold leading-tight text-orange-700 ${badge.length > 6 ? "text-xs" : "text-lg"}`}>{badge}</span>
      </Link>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link href={`/tiendas/${c.store_slug}`} className="font-bold text-slate-900 hover:underline dark:text-slate-100">{c.store_name}</Link>
          <StatusBadges c={c} today={today} />
        </div>
        <h3 className="mt-1.5 text-base font-bold leading-snug">
          <Link href={dealPath(c)} className="hover:text-blue-700 dark:hover:text-blue-400">{c.title}</Link>
        </h3>
        {c.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{c.description}</p>}
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {c.expires_at ? `Válido hasta el ${longDate(c.expires_at)}` : "Sin fecha de caducidad"} · <Link href={dealPath(c)} className="font-semibold hover:underline">Ver condiciones</Link>
        </p>
      </div>
      <div className="col-span-2 grid content-end gap-2 sm:col-span-1">
        {c.kind === "code" && c.code && <CopyCode code={c.code} compact />}
        <GoButton client={client} c={c} full />
      </div>
    </article>
  );
}

export function Faqs({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="grid gap-2">
      {items.map((f, i) => (
        <details key={i} open={i === 0} className="group rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <summary className="flex cursor-pointer list-none justify-between gap-3 px-4 py-3 font-semibold">
            {f.q}
            <span aria-hidden="true" className="font-mono text-blue-700 group-open:hidden dark:text-blue-400">+</span>
            <span aria-hidden="true" className="hidden font-mono text-blue-700 group-open:inline dark:text-blue-400">–</span>
          </summary>
          <p className="px-4 pb-4 text-sm text-slate-600 dark:text-slate-400">{f.a}</p>
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
