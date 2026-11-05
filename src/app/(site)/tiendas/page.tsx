import type { Metadata } from "next";
import Link from "next/link";
import { siteCoupons } from "@/lib/public-site";
import { madridToday, siteUrl } from "@/lib/site-text";
import { StoreMark } from "@/app/store-mark";
import { Crumbs, JsonLd, crumbsLd } from "../site-ui";

export const metadata: Metadata = {
  title: "Todas las tiendas con códigos descuento",
  description: "Las tiendas con cupones y códigos descuento activos hoy en CuponLab, de la A a la Z.",
  alternates: { canonical: "/tiendas" },
};

// A–Z of every store with at least one live coupon (stores with none would be thin pages)
export default async function StoresPage() {
  const coupons = await siteCoupons();
  const { words: todayWords } = madridToday();
  const byStore = new Map<string, { name: string; slug: string; hasLogo: boolean; count: number; codes: number }>();
  for (const c of coupons) {
    const s = byStore.get(c.store_slug) ?? { name: c.store_name, slug: c.store_slug, hasLogo: c.store_has_logo, count: 0, codes: 0 };
    s.count++;
    if (c.kind === "code") s.codes++;
    byStore.set(c.store_slug, s);
  }
  const stores = [...byStore.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const letterOf = (name: string) => {
    const l = name.normalize("NFD").charAt(0).toUpperCase();
    return /[A-Z]/.test(l) ? l : "#";
  };
  const groups = new Map<string, typeof stores>();
  for (const s of stores) groups.set(letterOf(s.name), [...(groups.get(letterOf(s.name)) ?? []), s]);
  const base = siteUrl();
  const crumbs = [{ name: "Inicio", href: "/" }, { name: "Tiendas" }];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-12">
      <JsonLd data={crumbsLd(base, crumbs)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Tiendas con códigos descuento",
          numberOfItems: stores.length,
          itemListElement: stores.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name, url: `${base}/tiendas/${s.slug}` })),
        }}
      />
      <div className="pt-5"><Crumbs items={crumbs} /></div>
      <section className="grid gap-3 py-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">Todas las tiendas con códigos descuento</h1>
        <p className="max-w-3xl text-[17px] leading-relaxed text-slate-700 dark:text-slate-300">
          Hoy, {todayWords}, hay <strong className="text-slate-900 dark:text-white">{stores.length} tiendas</strong> con cupones activos en CuponLab. Cada una tiene su página con los códigos que funcionan, sus condiciones y lo que conviene saber antes de comprar.
        </p>
        {groups.size > 1 && (
          <nav aria-label="Letras" className="flex flex-wrap gap-1">
            {[...groups.keys()].map((l) => (
              <a key={l} href={`#letra-${l}`} className="grid size-8 place-items-center rounded border border-slate-200 bg-white text-sm font-bold hover:border-blue-700 dark:border-slate-800 dark:bg-slate-900">{l}</a>
            ))}
          </nav>
        )}
      </section>
      {stores.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-400">Ahora mismo no hay tiendas con cupones activos. <Link href="/" className="font-semibold text-blue-700 hover:underline dark:text-blue-400">Volver a los chollos de hoy</Link></p>
      ) : (
        <div className="grid gap-8">
          {[...groups.entries()].map(([letter, list]) => (
            <section key={letter} id={`letra-${letter}`} className="grid scroll-mt-20 gap-3">
              <h2 className="text-xl font-bold">{letter}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/tiendas/${s.slug}`} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 hover:border-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-400">
                      <StoreMark slug={s.slug} name={s.name} hasLogo={s.hasLogo} size="md" />
                      <span className="min-w-0">
                        <b className="block truncate">{s.name}</b>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {s.count} {s.count === 1 ? "cupón" : "cupones"}{s.codes ? ` · ${s.codes} con código` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
