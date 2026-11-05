import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { parseFaqs } from "@/lib/affiliate";
import { siteClient, siteCoupon, siteCoupons, siteStoreById } from "@/lib/public-site";
import { daysBetween, dealPath, longDate, madridToday, parseDealId, siteUrl } from "@/lib/site-text";
import { StoreMark } from "@/app/store-mark";
import { CopyCode } from "../../copy-code";
import { Crumbs, DealCard, Faqs, GoButton, JsonLd, StatusBadges, badgeOf, crumbsLd, faqLd, offerLd } from "../../site-ui";

async function load(param: string) {
  const id = parseDealId(param);
  return id ? siteCoupon(id) : undefined;
}

export async function generateMetadata({ params }: PageProps<"/chollos/[deal]">): Promise<Metadata> {
  const found = await load((await params).deal);
  if (!found) return { title: "Chollo no encontrado", robots: { index: false } };
  const { coupon: c, live } = found;
  const badge = badgeOf(c);
  const what = c.kind === "code" ? `Código descuento ${c.store_name}` : `Oferta ${c.store_name}`;
  return {
    title: `${what}: ${c.title}`,
    description: [
      `${badge} en ${c.store_name}${c.kind === "code" && c.code ? ` con el código ${c.code}` : ""}.`,
      c.expires_at ? `${live ? "Válido hasta" : "Caducó"} el ${longDate(c.expires_at)}.` : "",
      c.description,
    ].filter(Boolean).join(" ").slice(0, 300),
    alternates: { canonical: dealPath(c) },
    openGraph: { title: `${what}: ${c.title}`, url: dealPath(c) },
  };
}

export default async function DealPage({ params }: PageProps<"/chollos/[deal]">) {
  const param = (await params).deal;
  const found = await load(param);
  if (!found) notFound();
  const { coupon: c, live } = found;
  // old or mistyped words after the id: send readers and crawlers to the one canonical URL
  if (`/chollos/${param}` !== dealPath(c)) permanentRedirect(dealPath(c));

  const [client, store, all] = await Promise.all([siteClient(), siteStoreById(c.store_id), siteCoupons()]);
  const { iso: today } = madridToday();
  const base = siteUrl();
  const badge = badgeOf(c);
  const storeFaqs = parseFaqs(store?.faqs ?? "");
  const more = all.filter((o) => o.store_id === c.store_id && o.id !== c.id).slice(0, 4);
  const others = more.length ? [] : all.filter((o) => o.store_id !== c.store_id).slice(0, 3);
  const left = c.expires_at ? daysBetween(today, c.expires_at) : null;
  const crumbs = [{ name: "Inicio", href: "/" }, { name: c.store_name, href: `/tiendas/${c.store_slug}` }, { name: c.title }];

  const answer = live
    ? `${c.kind === "code" ? `Con el código ${c.code || "de esta página"}` : "Sin código"} tienes ${badge.toLowerCase() === "oferta" ? "esta oferta" : badge} en ${c.store_name}. ${
        c.expires_at ? `Es válido hasta el ${longDate(c.expires_at)}${left !== null && left <= 7 ? `: ${left <= 0 ? "caduca hoy" : `quedan ${left} días`}` : ""}.` : "No tiene fecha de caducidad anunciada."
      } ${c.verified ? "Lo ha comprobado una persona del equipo de CuponLab." : "Viene de la red de afiliación de la tienda con sus condiciones oficiales."}`
    : `Este cupón de ${c.store_name} caducó el ${longDate(c.expires_at)} y ya no funciona.${more.length ? ` Hay ${more.length === 4 ? "más" : more.length} cupones activos de ${c.store_name} más abajo.` : ""}`;

  const steps =
    c.kind === "code" && c.code
      ? [
          <><b>Copia el código {c.code}</b> con el botón «Copiar».</>,
          <><b>Entra en {c.store_name}</b> desde «Ir a {c.store_name}» y añade lo que quieras comprar al carrito.</>,
          <><b>Pega el código</b> en el campo de código descuento o cupón antes de pagar.</>,
          <><b>Comprueba el total</b>: el descuento aparece antes de confirmar el pedido.</>,
        ]
      : [
          <><b>Entra en {c.store_name}</b> desde «Ir a {c.store_name}». El descuento ya está aplicado, no hace falta código.</>,
          <><b>Añade los productos al carrito</b> y revisa que cumplen las condiciones.</>,
          <><b>Comprueba el total</b> antes de pagar.</>,
        ];

  const conditions: [string, string][] = [
    ["Descuento", badge],
    ["Tipo", c.kind === "code" ? `Código: ${c.code}` : "Oferta, sin código"],
    ["Válido hasta", c.expires_at ? longDate(c.expires_at) : "Sin fecha de caducidad anunciada"],
    ["Estado", live ? (c.verified ? "Activo, comprobado por el equipo" : "Activo") : "Caducado"],
    ["Condiciones", c.description || "Las generales de la tienda"],
    ["Tienda", c.store_website.replace(/^https?:\/\//, "").replace(/\/$/, "")],
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 lg:pb-12">
      <JsonLd data={offerLd(base, c, live)} />
      <JsonLd data={crumbsLd(base, crumbs)} />
      {storeFaqs.length > 0 && <JsonLd data={faqLd(storeFaqs)} />}

      <div className="pt-5"><Crumbs items={crumbs} /></div>

      <div className="grid items-start gap-8 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 gap-8">
          <section className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-6">
            <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-md border border-slate-200 bg-white dark:border-slate-700">
              <StoreMark slug={c.store_slug} name={c.store_name} hasLogo={c.store_has_logo} size="lg" />
              <span className="text-xl font-extrabold text-orange-700 sm:text-2xl">{badge}</span>
            </div>
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/tiendas/${c.store_slug}`} className="font-bold hover:underline">{c.store_name}</Link>
                <StatusBadges c={c} today={today} live={live} />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">{c.title}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {c.expires_at ? <>{live ? "Válido hasta el" : "Caducó el"} <b className="text-slate-900 dark:text-white">{longDate(c.expires_at)}</b></> : "Sin fecha de caducidad"}
                {" · "}Publicado el {longDate(new Date(c.created_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }))}
              </p>
            </div>
          </section>

          <section className={`grid gap-1.5 rounded-md p-4 ${live ? "bg-green-50 dark:bg-green-950/50" : "bg-slate-100 dark:bg-slate-900"}`}>
            <h2 className="font-bold">{live ? "En resumen" : "Este cupón ya no funciona"}</h2>
            <p className="text-slate-700 dark:text-slate-300">{answer}</p>
          </section>

          <section className="grid gap-3">
            <h2 className="text-xl font-bold">Condiciones del cupón</h2>
            <dl className="grid overflow-hidden rounded-md border border-slate-200 bg-white text-sm sm:grid-cols-[180px_minmax(0,1fr)] dark:border-slate-800 dark:bg-slate-900">
              {conditions.map(([k, v], i) => (
                <div key={k} className="contents">
                  <dt className={`bg-slate-50 px-4 pt-2.5 text-slate-600 sm:py-2.5 dark:bg-slate-800/60 dark:text-slate-400 ${i ? "sm:border-t sm:border-slate-200 sm:dark:border-slate-800" : ""}`}>{k}</dt>
                  <dd className={`px-4 pb-2.5 sm:py-2.5 ${i ? "sm:border-t sm:border-slate-200 sm:dark:border-slate-800" : ""}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {live && (
            <section className="grid gap-3">
              <h2 className="text-xl font-bold">{c.kind === "code" && c.code ? `Cómo usar el código ${c.code}` : "Cómo conseguir este descuento"}</h2>
              <ol className="grid gap-2.5">
                {steps.map((s, i) => (
                  <li key={i} className="grid grid-cols-[26px_1fr] gap-2.5 text-slate-700 dark:text-slate-300">
                    <span className="grid size-[26px] place-items-center rounded-full border-[1.5px] border-blue-700 text-sm font-bold text-blue-700 dark:border-blue-400 dark:text-blue-400">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {store?.intro && (
            <section className="grid gap-2">
              <h2 className="text-xl font-bold">Sobre {c.store_name}</h2>
              <p className="max-w-[70ch] whitespace-pre-line text-slate-700 dark:text-slate-300">{store.intro}</p>
            </section>
          )}

          {storeFaqs.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-xl font-bold">Preguntas sobre los descuentos de {c.store_name}</h2>
              <Faqs items={storeFaqs} />
            </section>
          )}

          {(more.length > 0 || others.length > 0) && (
            <section className="grid gap-3">
              <h2 className="text-xl font-bold">{more.length ? `Más cupones de ${c.store_name}` : "Otros chollos de hoy"}</h2>
              <div className="grid gap-3">
                {(more.length ? more : others).map((o) => (
                  <DealCard key={o.id} c={o} client={client} today={today} />
                ))}
              </div>
              {more.length > 0 && (
                <Link href={`/tiendas/${c.store_slug}`} className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">
                  Ver todos los cupones de {c.store_name}
                </Link>
              )}
            </section>
          )}
        </div>

        <aside aria-label="Usar el cupón" className="grid gap-3 rounded-md border border-slate-200 bg-white p-5 lg:sticky lg:top-20 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-3xl font-extrabold text-orange-700">{badge}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">en {c.store_name}</p>
          {live ? (
            <>
              {c.kind === "code" && c.code && <CopyCode code={c.code} />}
              <GoButton client={client} c={c} full />
            </>
          ) : (
            <Link href={`/tiendas/${c.store_slug}`} className="inline-flex justify-center rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">
              Ver cupones activos de {c.store_name}
            </Link>
          )}
          <ul className="grid gap-1 border-t border-slate-200 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
            <li>{c.expires_at ? <>{live ? "Caduca" : "Caducó"} el <b className="text-slate-900 dark:text-white">{longDate(c.expires_at)}</b></> : "Sin fecha de caducidad"}</li>
            {c.verified ? <li>Comprobado por el equipo</li> : null}
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400">Enlace de afiliado: si compras, la tienda nos paga una comisión y tu precio no cambia.</p>
        </aside>
      </div>

      {live && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-slate-200 bg-white px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden dark:border-slate-800 dark:bg-slate-900">
          {c.kind === "code" && c.code ? (
            <div className="min-w-0 flex-1"><CopyCode code={c.code} compact /></div>
          ) : (
            <span className="flex-1 text-xl font-extrabold text-orange-700">{badge}</span>
          )}
          <GoButton client={client} c={c} label="Ir a la tienda" />
        </div>
      )}
    </main>
  );
}
