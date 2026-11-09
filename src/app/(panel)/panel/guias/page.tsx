import Link from "next/link";
import { io } from "next/cache";
import { publishGuideNow, rejectGuide, saveGuideSettings, writeGuideNow } from "@/app/actions-guides";
import { btnCls, btnSecondaryCls, cardCls, fmtDateTime, inputCls, PageHeader } from "@/app/ui";
import { requireEditor } from "@/lib/auth";
import { guideRows, guideSettings, nextCandidates, type GuideRow } from "@/lib/guides-cron";
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

export default async function GuidesPage() {
  const user = await requireEditor();
  await io();
  const [rows, settings, candidates] = await Promise.all([guideRows(), guideSettings(), nextCandidates(10)]);
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
                  <td className="py-2"><Link href={`/tiendas/${c.slug}`} className="underline">{c.name}</Link></td>
                  <td>{c.codes} ({c.lastingCodes})</td><td>{c.deals} ({c.lastingDeals})</td><td>{c.clicks30}</td><td>{c.impressions ?? 0}</td><td>{c.position == null ? "—" : c.position.toFixed(1)}</td><td className="font-semibold">{c.score}</td>
                  <td className="py-1 text-right"><StoreButton action={writeGuideNow} id={c.storeId} label="Escribir ahora" secondary /></td>
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
              <Link href={`/tiendas/${r.slug}`} className="underline">{r.name}</Link> · «{r.content.keyword}»
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
