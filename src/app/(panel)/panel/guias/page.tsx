import Link from "next/link";
import { siteUrl } from "@/lib/site-text";
import { io } from "next/cache";
import { publishGuideNow, rejectGuide, reviewFactCheck, saveGuideSettings, writeGuideNow } from "@/app/actions-guides";
import { factCheckRows, type FactCheckRow } from "@/lib/store-facts-cron";
import { sentenceDiff } from "@/lib/store-facts-check";
import { btnCls, btnSecondaryCls, cardCls, fmtDateTime, inputCls, PageHeader } from "@/app/ui";
import { requireEditor } from "@/lib/auth";
import { guideRows, guideSettings, nextCandidates, storesMissingFacts, type GuideRow } from "@/lib/guides-cron";
import { guideWords } from "@/lib/guide-rules";
import type { StoreGuide } from "@/lib/store-guides";

// "Escribir ahora" / "Reescribir" wait on the AI (up to two tries)
export const maxDuration = 300;

const STATUS: Record<GuideRow["status"], string> = { scheduled: "Programada", published: "Publicada", rejected: "Cancelada" };

function Preview({ guide }: { guide: StoreGuide }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-blue-700 dark:text-blue-400">Ver la guía ({guideWords(guide)} palabras)</summary>
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

function StoreButton({ action, id, label, secondary }: { action: (f: FormData) => Promise<void>; id: number; label: string; secondary?: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="store_id" value={id} />
      <button className={secondary ? btnSecondaryCls : btnCls}>{label}</button>
    </form>
  );
}

const CHECK_STATUS: Record<FactCheckRow["status"], string> = { pending: "Primera lectura pendiente", ok: "Sin cambios", changed: "Ha cambiado", unreadable: "No se puede leer" };

function ChangedCheck({ c }: { c: FactCheckRow }) {
  const d = sentenceDiff(c.previous, c.sentences);
  return (
    <div className={`${cardCls} space-y-2 text-sm`}>
      <p>
        <Link href={`/panel/stores/${c.slug}`} className="font-medium underline">{c.name}</Link> · {c.labels.join(", ")} ·{" "}
        <a href={c.url} target="_blank" rel="noreferrer" className="underline">ver la página</a>
        {c.changed_at ? <span className="text-neutral-500"> · cambió el {fmtDateTime(c.changed_at)}</span> : null}
      </p>
      {d.added.length > 0 && <ul className="list-disc pl-5 text-green-800 dark:text-green-400">{d.added.map((x) => <li key={x}>Ahora: {x}</li>)}</ul>}
      {d.removed.length > 0 && <ul className="list-disc pl-5 text-red-800 dark:text-red-400">{d.removed.map((x) => <li key={x}>Antes: {x}</li>)}</ul>}
      <form action={reviewFactCheck}>
        <input type="hidden" name="store_id" value={c.store_id} />
        <input type="hidden" name="url" value={c.url} />
        <button className={btnSecondaryCls}>Ya está revisado</button>
      </form>
    </div>
  );
}

export default async function GuidesPage() {
  const user = await requireEditor();
  await io();
  const [rows, settings, candidates, noFacts, checks] = await Promise.all([guideRows(), guideSettings(), nextCandidates(10), storesMissingFacts(15), factCheckRows()]);
  // waiting: new guides, and rewrites of published ones (the live guide stays until then)
  const scheduled = rows.filter((r) => r.status === "scheduled" || r.draft).sort((a, b) => +a.publish_at - +b.publish_at);
  const rest = rows.filter((r) => r.status !== "scheduled");

  return (
    <div className="space-y-8">
      <PageHeader title="Guías SEO" eyebrow="Automáticas: solo hace falta entrar para cancelar">
        <p className="text-sm text-neutral-500">
          Cada mañana se escriben hasta {settings.perDay} guías de las tiendas con al menos {settings.minLive} cupones activos y se publican
          {" "}{settings.delayHours} h después, salvo que las canceles. Aviso por Telegram.
        </p>
      </PageHeader>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Programadas</h2>
        {scheduled.length === 0 && <p className="text-sm text-neutral-500">Ninguna guía esperando.</p>}
        {scheduled.map((r) => (
          <div key={r.store_id} className={`${cardCls} space-y-3`}>
            <div>
              <p className="text-sm text-neutral-500">Se publica el {fmtDateTime(r.publish_at)} · escrita el {fmtDateTime(r.created_at)}</p>
              <p className="font-medium">{r.name} · «{r.content.keyword}»{r.draft ? " · reescritura (la guía actual sigue publicada)" : ""}</p>
            </div>
            <Preview guide={r.draft ?? r.content} />
            <div className="flex flex-wrap gap-2">
              <StoreButton action={rejectGuide} id={r.store_id} label="Cancelar" secondary />
              <StoreButton action={publishGuideNow} id={r.store_id} label="Publicar ya" />
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Próximas candidatas</h2>
        <p className="text-sm text-neutral-500">Solo tiendas de España sin guía, con al menos un código y contenido que siga vivo en 14 días. Puntuación: 5 por código que dura (máx. 5), 2 por código que caduca pronto (máx. 3), 1 por oferta que dura (máx. 8), 2 por clic de 30 días (máx. 15), impresiones en Google ÷ 20 (máx. 40), +15 si Google la muestra entre la posición 8 y la 30, −20 si con 100+ impresiones sigue por detrás de la 40.</p>
        {candidates.length === 0 && <p className="text-sm text-neutral-500">Ninguna tienda llega al mínimo ahora mismo.</p>}
        {candidates.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr><th className="py-2">Tienda</th><th>Códigos (duran)</th><th>Ofertas (duran)</th><th>Clics 30 d</th><th>Impresiones</th><th>Posición</th><th>Puntuación</th><th /></tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.storeId} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-2"><a href={`${siteUrl()}/tiendas/${c.slug}`} className="underline">{c.name}</a></td>
                  <td>{c.codes} ({c.lastingCodes})</td><td>{c.deals} ({c.lastingDeals})</td><td>{c.clicks30}</td><td>{c.impressions ?? 0}</td><td>{c.position == null ? "—" : c.position.toFixed(1)}</td><td className="font-semibold">{c.score}</td>
                  <td className="py-1 text-right"><StoreButton action={writeGuideNow} id={c.storeId} label="Escribir ahora" secondary /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Datos de tienda por completar</h2>
        <p className="text-sm text-neutral-500">De las 15 tiendas con más cupones activos, las que no dicen aún su envío, devoluciones, códigos por pedido o formas de pago. Salen en su página y en cada chollo; cópialos de la web de la tienda.</p>
        {noFacts.length === 0 && <p className="text-sm text-neutral-500">Todas tienen sus datos.</p>}
        {noFacts.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr><th className="py-2">Tienda</th><th>Cupones activos</th><th>Faltan</th></tr>
            </thead>
            <tbody>
              {noFacts.map((s) => (
                <tr key={s.slug} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-2"><Link href={`/panel/stores/${s.slug}`} className="underline">{s.name}</Link></td>
                  <td>{s.live}</td>
                  <td>{s.missing.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>


      <section id="revision-datos" className="space-y-3">
        <h2 className="text-lg font-semibold">Revisión de datos de tienda</h2>
        <p className="text-sm text-neutral-500">
          Cada mañana se vuelven a leer las páginas de donde se copiaron los datos (las líneas «Etiqueta | URL» de «Fuentes de los datos» en la
          ficha de cada tienda). Si el texto de envío, devoluciones, códigos o pagos cambia, sale aquí y llega un aviso por Telegram. No se cambia
          nada solo: corrige los datos en la ficha y pulsa «Ya está revisado».
        </p>
        {checks.length === 0 && <p className="text-sm text-neutral-500">Ninguna tienda tiene fuentes todavía.</p>}
        {checks.filter((c) => c.status === "changed").map((c) => <ChangedCheck key={`${c.store_id} ${c.url}`} c={c} />)}
        {checks.some((c) => c.status !== "changed") && (
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr><th className="py-2">Tienda</th><th>Datos</th><th>Estado</th><th>Última lectura</th></tr>
            </thead>
            <tbody>
              {checks.filter((c) => c.status !== "changed").map((c) => (
                <tr key={`${c.store_id} ${c.url}`} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                  <td className="py-2"><Link href={`/panel/stores/${c.slug}`} className="underline">{c.name}</Link></td>
                  <td><a href={c.url} target="_blank" rel="noreferrer" className="underline">{c.labels.join(", ")}</a></td>
                  <td>{CHECK_STATUS[c.status]}{c.detail ? <span className="block text-xs text-neutral-500">{c.detail}{c.fails ? ` (${c.fails} intentos seguidos)` : ""}</span> : null}</td>
                  <td>{c.checked_at ? fmtDateTime(c.checked_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Publicadas y canceladas</h2>
        {rest.length === 0 && <p className="text-sm text-neutral-500">Todavía ninguna.</p>}
        {rest.map((r) => (
          <div key={r.store_id} className={`${cardCls} space-y-3`}>
            <p className="text-sm text-neutral-500">
              {STATUS[r.status]}{r.published_at ? ` el ${fmtDateTime(r.published_at)}` : ""} ·{" "}
              <a href={`${siteUrl()}/tiendas/${r.slug}`} className="underline">{r.name}</a> · «{r.content.keyword}»
            </p>
            {r.status === "rejected" && r.signals.problems?.length ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">La IA no consiguió una guía válida: {r.signals.problems.join("; ")}.</p>
            ) : null}
            <Preview guide={r.content} />
            <div className="flex flex-wrap gap-2">
              {r.status === "published" && <StoreButton action={rejectGuide} id={r.store_id} label="Quitar de la web" secondary />}
              <StoreButton action={writeGuideNow} id={r.store_id} label="Reescribir" secondary />
            </div>
          </div>
        ))}
      </section>

      {user.role === "admin" && (
        <section className={`${cardCls} space-y-3`}>
          <h2 className="text-lg font-semibold">Ajustes</h2>
          <form action={saveGuideSettings} className="grid gap-3 sm:grid-cols-4">
            <label className="flex items-center gap-2 text-sm sm:col-span-4">
              <input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Escribir guías automáticamente
            </label>
            <label className="text-sm">Mínimo de cupones activos<input name="min_live" type="number" min={1} max={100} defaultValue={settings.minLive} className={inputCls} /></label>
            <label className="text-sm">Guías al día (máx. 5)<input name="per_day" type="number" min={1} max={5} defaultValue={settings.perDay} className={inputCls} /></label>
            <label className="text-sm">Horas antes de publicar<input name="delay_hours" type="number" min={0} max={336} defaultValue={settings.delayHours} className={inputCls} /></label>
            <div className="flex items-end"><button className={btnCls}>Guardar</button></div>
          </form>
        </section>
      )}
    </div>
  );
}
