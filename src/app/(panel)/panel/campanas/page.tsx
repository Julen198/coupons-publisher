import Link from "next/link";
import { io } from "next/cache";
import { publishCampaignNow, rejectCampaign, runCampaignsNow, saveCampaignSettings, writeCampaignNow } from "@/app/actions-campaigns";
import { btnCls, btnSecondaryCls, cardCls, fmtDateTime, inputCls, PageHeader } from "@/app/ui";
import { requireEditor } from "@/lib/auth";
import { campaignPlan, campaignReports, campaignRows, campaignSettings, detectedEvents, type CampaignRow } from "@/lib/campaigns-cron";
import { NEAR_MAX, NEAR_MIN, eventsToPlan } from "@/lib/campaign-rules";
import { eventPageOf, storeEventPath } from "@/lib/event-pages";
import { guideWords } from "@/lib/guide-rules";
import { longDate, madridToday, siteUrl } from "@/lib/site-text";
import type { StoreGuide } from "@/lib/store-guides";

// «Escribir ahora» and «Ejecutar ahora» wait on the AI
export const maxDuration = 300;

const STATUS: Record<CampaignRow["status"], string> = { scheduled: "Programada", published: "Publicada", rejected: "Cancelada" };
const REASON: Record<string, string> = { busqueda: "por búsquedas de Google", calendario: "por calendario", "a mano": "a mano" };
const evName = (slug: string) => eventPageOf(slug)?.name ?? slug;

function Preview({ guide }: { guide: StoreGuide }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-blue-700 dark:text-blue-400">Ver el texto ({guideWords(guide)} palabras)</summary>
      <div className="mt-3 space-y-3 text-neutral-700 dark:text-neutral-300">
        <p className="text-xs text-neutral-500">Meta description: {guide.description}</p>
        <p className="font-medium">{guide.lead}</p>
        {guide.sections.map((s) => (
          <div key={s.heading} className="space-y-1">
            <p className="font-semibold">{s.heading}</p>
            {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            {s.steps && <ol className="list-decimal pl-5">{s.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>}
          </div>
        ))}
        <div className="space-y-1">
          <p className="font-semibold">Preguntas</p>
          {guide.faqs.map((f) => <p key={f.q}><strong>{f.q}</strong> {f.a}</p>)}
        </div>
      </div>
    </details>
  );
}

function PageButton({ action, id, event, label, secondary, queries }: { action: (f: FormData) => Promise<void>; id: number; event: string; label: string; secondary?: boolean; queries?: string[] }) {
  return (
    <form action={action}>
      <input type="hidden" name="store_id" value={id} />
      <input type="hidden" name="event" value={event} />
      {queries?.length ? <input type="hidden" name="queries" value={queries.join("\n")} /> : null}
      <button className={secondary ? btnSecondaryCls : btnCls}>{label}</button>
    </form>
  );
}

export default async function CampaignsPage() {
  const user = await requireEditor();
  await io();
  const settings = await campaignSettings();
  const [rows, plan, reports, detected] = await Promise.all([campaignRows(), campaignPlan(settings), campaignReports(), detectedEvents()]);
  const today = madridToday().iso;
  const coming = eventsToPlan(today, 120);
  const scheduled = rows.filter((r) => r.status === "scheduled").sort((a, b) => +a.publish_at - +b.publish_at);
  const rest = rows.filter((r) => r.status !== "scheduled");
  const opps = plan.opportunities.slice(0, 40);
  const base = siteUrl();

  return (
    <div className="space-y-8">
      <PageHeader title="Campañas" eyebrow="Automáticas: solo hace falta entrar para cancelar">
        <p className="text-sm text-neutral-500">
          Cada hora se escriben páginas de tienda para cada fecha de compras (por ejemplo «Black Friday Shein»): primero las
          que Google ya muestra entre la posición {NEAR_MIN} y la {NEAR_MAX}, después las {settings.storesPerEvent} mejores tiendas de cada fecha desde{" "}
          {settings.leadDays} días antes ({settings.perDay} al día; sin límite práctico para las búsquedas y las fechas de esta semana).{" "}
          {settings.delayHours ? `Se publican ${settings.delayHours} h después (al momento si la fecha está a menos de una semana), salvo que las canceles.` : "Se publican al momento y se avisa a IndexNow; «Quitar de la web» las retira."}
          También se buscan eventos nuevos en los cupones y en las búsquedas, y cada fecha tiene su informe de antes y después. Todo llega por Telegram.
        </p>
      </PageHeader>

      {user.role === "admin" && (
        <form action={runCampaignsNow}>
          <button className={btnCls}>Ejecutar ahora</button>
          <span className="ml-3 text-sm text-neutral-500">Hace lo mismo que el cron (puede tardar unos minutos).</span>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Próximas fechas</h2>
        <ul className="text-sm">
          {coming.map((ed) => {
            const n = rows.filter((r) => r.event === ed.event.slug && r.year === ed.year && r.status !== "rejected").length;
            return (
              <li key={ed.event.slug} className="border-t border-neutral-200 py-1 dark:border-neutral-800">
                <a href={`${base}/ofertas/${ed.event.slug}`} className="underline">{ed.event.name} {ed.year}</a> · {longDate(ed.date)} · {n} páginas de tienda
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Programadas</h2>
        {scheduled.length === 0 && <p className="text-sm text-neutral-500">Ninguna página esperando.</p>}
        {scheduled.map((r) => (
          <div key={`${r.store_id}-${r.event}`} className={`${cardCls} space-y-3`}>
            <div>
              <p className="text-sm text-neutral-500">Se publica el {fmtDateTime(r.publish_at)} · {REASON[r.signals.reason ?? ""] ?? ""}</p>
              <p className="font-medium">{evName(r.event)} {r.year} · {r.name}{r.signals.queries?.length ? ` · «${r.signals.queries.slice(0, 3).join("», «")}»` : ""}</p>
            </div>
            <Preview guide={r.content} />
            <div className="flex flex-wrap gap-2">
              <PageButton action={rejectCampaign} id={r.store_id} event={r.event} label="Cancelar" secondary />
              <PageButton action={publishCampaignNow} id={r.store_id} event={r.event} label="Publicar ya" />
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Siguientes en la cola</h2>
        <p className="text-sm text-neutral-500">Lo que se escribirá en las próximas ejecuciones, en este orden.</p>
        {plan.targets.length === 0 && <p className="text-sm text-neutral-500">Nada pendiente.</p>}
        {plan.targets.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500"><tr><th className="py-2">Página</th><th>Motivo</th><th>Impresiones</th><th>Posición</th><th /></tr></thead>
            <tbody>
              {plan.targets.slice(0, 30).map((t) => (
                <tr key={`${t.storeId}-${t.event}`} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-2"><a href={`${base}${storeEventPath(t.event, t.slug)}`} className="underline">{evName(t.event)} {t.name}</a></td>
                  <td>{REASON[t.reason]}{t.queries.length ? ` («${t.queries[0]}»)` : ""}</td>
                  <td>{t.impressions}</td>
                  <td>{t.position ?? "—"}</td>
                  <td className="py-1 text-right"><PageButton action={writeCampaignNow} id={t.storeId} event={t.event} queries={t.queries} label="Escribir ahora" secondary /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Búsquedas cerca de la primera página</h2>
        <p className="text-sm text-neutral-500">Search Console, últimos 28 días, entre la posición {NEAR_MIN} y la {NEAR_MAX}, agrupadas por lo que piden. Las de tienda + fecha tienen página propia; las de tienda escriben o reescriben su guía (en Guías SEO).</p>
        {plan.guides.length > 0 && <p className="text-sm">Guías de tienda en cola: {plan.guides.map((g) => `${g.name}${g.rewrite ? " (reescritura)" : ""}`).join(", ")}. <Link href="/panel/guias" className="underline">Ver guías</Link></p>}
        {opps.length === 0 && <p className="text-sm text-neutral-500">Sin datos de Search Console o ninguna búsqueda en ese rango.</p>}
        {opps.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500"><tr><th className="py-2">Qué piden</th><th>Búsquedas</th><th>Impresiones</th><th>Clics</th><th>Posición</th></tr></thead>
            <tbody>
              {opps.map((o) => (
                <tr key={`${o.kind}-${o.slug}-${o.event}`} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                  <td className="py-2">{[o.event ? evName(o.event) : "", o.name ?? ""].filter(Boolean).join(" · ")}</td>
                  <td className="text-neutral-600 dark:text-neutral-400">{o.queries.slice(0, 4).join(", ")}{o.queries.length > 4 ? ` y ${o.queries.length - 4} más` : ""}</td>
                  <td>{o.impressions}</td><td>{o.clicks}</td><td>{o.position}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Eventos detectados</h2>
        <p className="text-sm text-neutral-500">Campañas que aparecen en los cupones de las redes o en las búsquedas y no están en el calendario (Prime Day, días sin IVA, aniversarios…).</p>
        {detected.length === 0 && <p className="text-sm text-neutral-500">Ninguno por ahora.</p>}
        <ul className="space-y-1 text-sm">
          {detected.map((d) => (
            <li key={d.key}><strong>{d.name}</strong>: {d.count} menciones{d.stores.length ? ` (${d.stores.slice(0, 5).join(", ")})` : ""}{d.fromSearch ? `, ${d.fromSearch} en Google` : ""} · visto desde {d.firstSeen}{d.samples[0] ? <span className="text-neutral-500"> · «{d.samples[0]}»</span> : null}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Informes antes y después</h2>
        {reports.length === 0 && <p className="text-sm text-neutral-500">Todavía ninguno. El de partida sale cuando una fecha entra en el plan y el final, una semana después de que termine.</p>}
        {reports.map((r) => (
          <details key={`${r.event}-${r.year}-${r.kind}`} className={cardCls}>
            <summary className="cursor-pointer text-sm font-medium">{r.kind === "review" ? "Informe final" : "Punto de partida"} · {evName(r.event)} {r.year} · {fmtDateTime(r.created_at)}</summary>
            <pre className="mt-3 whitespace-pre-wrap text-sm">{r.text}</pre>
          </details>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Publicadas y canceladas</h2>
        {rest.length === 0 && <p className="text-sm text-neutral-500">Todavía ninguna.</p>}
        {rest.map((r) => (
          <div key={`${r.store_id}-${r.event}`} className={`${cardCls} space-y-3`}>
            <p className="text-sm text-neutral-500">
              {STATUS[r.status]}{r.published_at ? ` el ${fmtDateTime(r.published_at)}` : ""} ·{" "}
              <a href={`${base}${storeEventPath(r.event, r.slug)}`} className="underline">{evName(r.event)} {r.year} {r.name}</a>
            </p>
            {r.status === "rejected" && r.signals.problems?.length ? <p className="text-sm text-amber-700 dark:text-amber-400">La IA no consiguió un texto válido: {r.signals.problems.join("; ")}.</p> : null}
            <Preview guide={r.content} />
            <div className="flex flex-wrap gap-2">
              {r.status === "published" && <PageButton action={rejectCampaign} id={r.store_id} event={r.event} label="Quitar de la web" secondary />}
              <PageButton action={writeCampaignNow} id={r.store_id} event={r.event} queries={r.signals.queries} label="Reescribir" secondary />
            </div>
          </div>
        ))}
      </section>

      {user.role === "admin" && (
        <section className={`${cardCls} space-y-3`}>
          <h2 className="text-lg font-semibold">Ajustes</h2>
          <form action={saveCampaignSettings} className="grid gap-3 sm:grid-cols-5">
            <label className="flex items-center gap-2 text-sm sm:col-span-5"><input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Escribir páginas de campaña automáticamente</label>
            <label className="text-sm">Páginas al día (máx. 12)<input name="per_day" type="number" min={1} max={12} defaultValue={settings.perDay} className={inputCls} /></label>
            <label className="text-sm">Horas antes de publicar<input name="delay_hours" type="number" min={0} max={168} defaultValue={settings.delayHours} className={inputCls} /></label>
            <label className="text-sm">Días de antelación<input name="lead_days" type="number" min={7} max={120} defaultValue={settings.leadDays} className={inputCls} /></label>
            <label className="text-sm">Tiendas por fecha<input name="stores_per_event" type="number" min={1} max={40} defaultValue={settings.storesPerEvent} className={inputCls} /></label>
            <div className="flex items-end"><button className={btnCls}>Guardar</button></div>
          </form>
        </section>
      )}
    </div>
  );
}
