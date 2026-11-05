import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageTitle, parseFaqs } from "@/lib/affiliate";
import { siteClient, siteCoupons, siteStore } from "@/lib/public-site";
import { longDate, madridToday, percentOf, siteUrl } from "@/lib/site-text";
import { StoreMark } from "@/app/store-mark";
import { Crumbs, DealCard, Faqs, JsonLd, badgeOf, crumbsLd, faqLd, offerLd } from "../../site-ui";

async function load(slug: string) {
  const store = await siteStore(slug);
  if (!store) return undefined;
  const coupons = (await siteCoupons()).filter((c) => c.store_id === store.id);
  return { store, coupons };
}

export async function generateMetadata({ params }: PageProps<"/tiendas/[slug]">): Promise<Metadata> {
  const found = await load((await params).slug);
  if (!found) return { title: "Tienda no encontrada", robots: { index: false } };
  const { store, coupons } = found;
  const codes = coupons.filter((c) => c.kind === "code").length;
  return {
    title: { absolute: `${pageTitle(store.name, coupons.map((c) => c.discount), new Date())} | CuponLab` },
    description: `${coupons.length} cupones activos de ${store.name} (${codes} códigos descuento), con condiciones y fecha de caducidad.`,
    alternates: { canonical: `/tiendas/${store.slug}` },
    // a store with nothing live is a thin page: keep it reachable but out of the index
    robots: coupons.length ? undefined : { index: false, follow: true },
  };
}

export default async function StorePage({ params }: PageProps<"/tiendas/[slug]">) {
  const found = await load((await params).slug);
  if (!found) notFound();
  const { store, coupons } = found;
  const client = await siteClient();
  const now = new Date();
  const { iso: today, words: todayWords } = madridToday(now);
  const base = siteUrl();
  const faqs = parseFaqs(store.faqs);
  const codes = coupons.filter((c) => c.kind === "code").length;
  const best = [...coupons].sort((a, b) => percentOf(b.discount) - percentOf(a.discount))[0];
  const sorted = [...coupons].sort((a, b) => b.verified - a.verified || percentOf(b.discount) - percentOf(a.discount) || b.id - a.id);
  const crumbs = [{ name: "Inicio", href: "/" }, { name: store.name }];

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12">
      <JsonLd data={crumbsLd(base, crumbs)} />
      {sorted.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `Códigos descuento ${store.name}`,
            numberOfItems: sorted.length,
            itemListElement: sorted.map((c, i) => ({ "@type": "ListItem", position: i + 1, item: offerLd(base, c) })),
          }}
        />
      )}
      {faqs.length > 0 && <JsonLd data={faqLd(faqs)} />}

      <div className="pt-5"><Crumbs items={crumbs} /></div>

      <section className="grid gap-3 py-6">
        <div className="flex items-center gap-4">
          <StoreMark slug={store.slug} name={store.name} hasLogo={store.has_logo} size="lg" />
          <h1 className="text-3xl font-extrabold tracking-tight text-balance">{pageTitle(store.name, coupons.map((c) => c.discount), now)}</h1>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">Actualizado el {todayWords} · Por el equipo editorial de CuponLab</p>
        <p className="max-w-3xl text-[17px] leading-relaxed text-slate-700 dark:text-slate-300">
          {coupons.length ? (
            <>
              Hoy hay <strong className="text-slate-900 dark:text-white">{coupons.length} {coupons.length === 1 ? "cupón activo" : "cupones activos"}</strong> de {store.name}: {codes} con código y {coupons.length - codes} sin código.
              {best && percentOf(best.discount) > 0 && (
                <> El mejor es <strong className="text-slate-900 dark:text-white">{badgeOf(best)}</strong>{best.expires_at ? <>, válido hasta el {longDate(best.expires_at)}</> : null}.</>
              )}
            </>
          ) : (
            <>Ahora mismo no hay cupones activos de {store.name}. Lo revisamos a diario: vuelve pronto o mira los <Link href="/" className="font-semibold text-blue-700 hover:underline dark:text-blue-400">chollos de hoy</Link>.</>
          )}
        </p>
      </section>

      {sorted.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-bold">Cupones de {store.name}</h2>
          {sorted.map((c) => (
            <DealCard key={c.id} c={c} client={client} today={today} />
          ))}
        </section>
      )}

      {store.intro && (
        <section className="grid gap-2 pt-10">
          <h2 className="text-xl font-bold">Lo que conviene saber de {store.name}</h2>
          <p className="max-w-[70ch] whitespace-pre-line text-slate-700 dark:text-slate-300">{store.intro}</p>
        </section>
      )}

      {faqs.length > 0 && (
        <section className="grid gap-3 pt-10">
          <h2 className="text-xl font-bold">Preguntas frecuentes sobre {store.name}</h2>
          <Faqs items={faqs} />
        </section>
      )}
    </main>
  );
}
