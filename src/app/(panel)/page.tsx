import Link from "next/link";
import { storeTracked } from "@/lib/affiliate";
import { canEdit, onlyVisible, requireUser, visibleClientIds } from "@/lib/auth";
import { clickStats } from "@/lib/clicks";
import { listActivity, listAllCoupons, listClients, listPages, listStores } from "@/lib/db";
import { expiresSoon, matchesFilter, statusOf, today } from "@/lib/coupon-status";
import { COVERAGE_LABEL, coverageOf } from "@/lib/page-status";
import { btnCls, btnSecondaryCls, cardCls, fmtDateTime, PageHeader } from "@/app/ui";
import { Onboarding } from "./onboarding";


// "Accor, adidas, AEG, Agoda y 76 más": long lists of names don't belong in an alert
function shortList(names: string[], max = 4) {
  const unique = [...new Set(names)];
  return unique.length <= max ? unique.join(", ") : `${unique.slice(0, max).join(", ")} y ${unique.length - max} más`;
}

const COVER_BAR = { live: "bg-green-600 dark:bg-green-500", stale: "bg-amber-500", draft: "bg-sky-400 dark:bg-sky-600" } as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const [allClients, stores, allPages, coupons, activity, clicks] = await Promise.all([
    listClients(), listStores(), listPages(), listAllCoupons(), listActivity(), clickStats(30, undefined, visibleClientIds(user)),
  ]);
  const clients = onlyVisible(user, allClients, "id");
  const pages = onlyVisible(user, allPages);
  const now = new Date();
  const t = today(now);

  const coverage = pages.map((p) => coverageOf(p, now));
  const published = coverage.filter((c) => c === "live" || c === "stale").length;
  const activeClients = new Set(pages.filter((p) => coverageOf(p, now) === "live").map((p) => p.client_id)).size;

  const expiredVisible = coupons.filter((c) => statusOf(c, t) === "expired");
  const pending = coupons.filter((c) => statusOf(c, t) === "pending");
  const soon = coupons.filter((c) => expiresSoon(c, t));
  const stale = pages.filter((p) => coverageOf(p, now) === "stale");
  const noAwinClients = clients.filter((c) => !c.awin_affiliate_id);
  const noMerchant = stores.filter((s) => !storeTracked(s));

  const alerts = [
    stale.length && { tag: "Mes", href: "/pages?coverage=stale", title: `${stale.length} página(s) HTML con el mes pasado`, detail: shortList(stale.map((p) => `${p.client_name} · ${p.store_name}`)) },
    soon.length && { tag: "Caducan", href: "/coupons?status=soon", title: `${soon.length} cupón(es) caducan en 7 días`, detail: shortList(soon.map((c) => c.store_name)) },
    pending.length && { tag: "Verificar", href: "/coupons?status=pending", title: `${pending.length} cupón(es) sin verificar`, detail: shortList(pending.map((c) => c.store_name)) },
    expiredVisible.length && { tag: "Caducados", href: "/coupons?status=expired", title: `${expiredVisible.length} cupón(es) caducados`, detail: "Ya no salen en las páginas; retíralos o actualiza la fecha" },
    noAwinClients.length && { tag: "Awin", href: "/clients", title: `${noAwinClients.length} cliente(s) sin affiliate ID`, detail: `${shortList(noAwinClients.map((c) => c.name))}: sus enlaces van sin tracking` },
    noMerchant.length && { tag: "Tracking", href: "/stores", title: `${noMerchant.length} tienda(s) sin merchant ID o enlace`, detail: shortList(noMerchant.map((s) => s.name)) },
  ].filter(Boolean) as { tag: string; href: string; title: string; detail: string }[];


  // first-run guide until the first page is published (editors and admins; viewers can't act on it)
  const firstPage = pages.find((p) => p.status === "published") ? null : pages[0];
  const onboarding = canEdit(user) && published === 0 ? [
    { done: clients.length > 0, title: "Crea tu primer cliente", detail: "El medio que publicará los cupones: su dominio, su ID de Awin y el estilo de su web.", href: "/clients/new", cta: "Nuevo cliente" },
    { done: stores.length > 0, title: "Añade una tienda", detail: "El anunciante (adidas, Decathlon…) con su web y su merchant ID de Awin.", href: "/stores", cta: "Nueva tienda" },
    { done: coupons.length > 0, title: "Añade cupones", detail: "Códigos y ofertas de esa tienda; a mano, desde Awin o importando un CSV.", href: stores[0] ? `/stores/${stores[0].slug}?tab=cupones&new` : "/coupons", cta: "Añadir cupón" },
    { done: pages.length > 0, title: "Asigna la tienda al cliente", detail: "En la ficha del cliente, «Añadir tienda» crea su página.", href: clients[0] ? `/clients/${clients[0].slug}` : "/clients", cta: "Ir al cliente" },
    { done: false, title: "Publica la página", detail: "Elige cómo le llega al medio (subdominio, widget o HTML) y publícala.", href: firstPage ? `/pages/${firstPage.client_slug}/${firstPage.store_slug}` : "/pages", cta: "Abrir generador" },
  ] : null;

  const kpis = [
    { label: "Clientes activos", value: activeClients, note: `de ${clients.length} con alguna página publicada` },
    { label: "Páginas publicadas", value: published, note: `de ${clients.length * stores.length} combinaciones cliente × tienda` },
    { label: "Cupones activos", value: coupons.filter((c) => matchesFilter(c, "all", t) && statusOf(c, t) !== "expired").length, note: `en ${stores.length} tiendas` },
    { label: "Clics (30 días)", value: clicks.total.toLocaleString("es-ES"), note: clicks.previous ? `${clicks.total >= clicks.previous ? "▲" : "▼"} ${Math.abs(Math.round(((clicks.total - clicks.previous) / clicks.previous) * 100))}% frente a los 30 anteriores` : "Ver detalle en Clics", href: "/clicks" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow={now.toLocaleDateString("es-ES", { month: "long", year: "numeric" })} title="Resumen">
        {canEdit(user) && <Link href="/stores" className={btnSecondaryCls}>Nueva tienda</Link>}
        {user.role === "admin" && <Link href="/clients/new" className={btnCls}>Nuevo cliente</Link>}
      </PageHeader>

      {onboarding && <Onboarding steps={onboarding} />}

      <section aria-label="Indicadores" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {kpis.map((k) => {
          const body = (
            <>
              <span className="text-sm text-neutral-600 dark:text-neutral-400">{k.label}</span>
              <span className="text-3xl font-bold tabular-nums">{k.value}</span>
              <span className="text-xs text-neutral-500">{k.note}</span>
            </>
          );
          return "href" in k && k.href ? (
            <Link key={k.label} href={k.href} className={`${cardCls} flex flex-col gap-1 hover:border-blue-700 dark:hover:border-blue-400`}>{body}</Link>
          ) : (
            <div key={k.label} className={`${cardCls} flex flex-col gap-1`}>{body}</div>
          );
        })}
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="cov" className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h2 id="cov" className="font-semibold">Cobertura por medio</h2>
            <div className="flex flex-wrap gap-3 text-xs text-neutral-600 dark:text-neutral-400">
              {(["live", "stale", "draft"] as const).map((c) => (
                <span key={c} className="flex items-center gap-1.5"><span className={`inline-block size-3 rounded ${COVER_BAR[c]}`} />{COVERAGE_LABEL[c]}</span>
              ))}
            </div>
          </div>
          {(clients.length === 0 || stores.length === 0) && (
            <p className="px-5 py-10 text-center text-sm text-neutral-500">
              Aquí verás qué tiendas tiene publicadas cada medio. Necesitas al menos un cliente y una tienda.
            </p>
          )}
          {/* one row per client whatever the number of stores; the store-by-store detail lives in Páginas */}
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {clients.length > 0 && stores.length > 0 && clients.map((c) => {
              const mine = pages.filter((p) => p.client_id === c.id);
              const by = { live: 0, stale: 0, draft: 0 };
              for (const p of mine) {
                const cov = coverageOf(p, now);
                if (cov !== "none") by[cov] += 1;
              }
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                  <Link href={`/clients/${c.slug}`} className="flex min-w-48 flex-1 items-center gap-2.5 font-medium hover:underline">
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: c.brand_color }} />
                    <span className="flex flex-col">{c.name}<span className="text-xs font-normal text-neutral-500">{mine.length} {mine.length === 1 ? "tienda" : "tiendas"}</span></span>
                  </Link>
                  {mine.length ? (
                    <div className="flex min-w-56 flex-[2_1_240px] flex-col gap-1.5">
                      <div role="img" aria-label={`${by.live} publicadas, ${by.stale} desactualizadas y ${by.draft} borradores de ${mine.length}`} className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                        {(["live", "stale", "draft"] as const).map((k) => by[k] > 0 && <span key={k} className={COVER_BAR[k]} style={{ width: `${(by[k] / mine.length) * 100}%` }} />)}
                      </div>
                      <span className="text-xs text-neutral-600 dark:text-neutral-400">
                        {by.live} publicadas{by.stale ? ` · ${by.stale} desactualizadas` : ""}{by.draft ? ` · ${by.draft} en borrador` : ""}
                      </span>
                    </div>
                  ) : (
                    <span className="flex-[2_1_240px] text-sm text-neutral-500">Sin tiendas asignadas</span>
                  )}
                  <Link href={mine.length ? `/pages?client=${c.slug}` : `/clients/${c.slug}`} className="text-sm text-blue-700 hover:underline dark:text-blue-300">
                    {mine.length ? "Ver sus páginas →" : "Asignar tiendas →"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <aside aria-labelledby="att" className={`${cardCls} flex min-w-0 flex-[1_1_300px] flex-col`}>
          <h2 id="att" className="mb-2 font-semibold">Requiere atención</h2>
          {alerts.length === 0 && <p className="text-sm text-neutral-500">Todo en orden.</p>}
          {alerts.map((a) => (
            // fixed tag column: every title starts on the same line whatever the tag's width
            <Link key={a.title} href={a.href} className="grid grid-cols-[5.5rem_1fr] items-start gap-3 border-t border-neutral-100 py-3 first-of-type:border-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
              <span className="mt-0.5 justify-self-start rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">{a.tag}</span>
              <span className="flex flex-col text-sm"><span className="font-medium">{a.title}</span><span className="text-xs text-neutral-500">{a.detail}</span></span>
            </Link>
          ))}
        </aside>
      </div>

      <section aria-labelledby="act" className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <h2 id="act" className="border-b border-neutral-200 px-5 py-4 font-semibold dark:border-neutral-800">Últimos cambios</h2>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {activity.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <span className="w-28 shrink-0 text-xs text-neutral-500">{fmtDateTime(a.at)}</span>
              <span>{a.text}</span>
            </li>
          ))}
          {activity.length === 0 && <li className="px-5 py-3 text-sm text-neutral-500">Sin cambios todavía.</li>}
        </ul>
      </section>
    </div>
  );
}
