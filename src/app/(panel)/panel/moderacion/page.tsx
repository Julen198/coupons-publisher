import Link from "next/link";
import { dismissExpiryReports, publishShared, rejectShared, retireReported, setCommentHidden, setReaderBlocked } from "@/app/actions-community";
import { btnCls, btnSecondaryCls, cardCls, fmtDateTime, inputCls, PageHeader } from "@/app/ui";
import { REJECT_REASONS } from "@/lib/community-rules";
import { requireEditor } from "@/lib/auth";
import { io } from "next/cache";
import { sql } from "@/lib/db";
import { dealPath } from "@/lib/site-text";
import { AboutDraftForm, DraftAboutsButton } from "./about-drafts";
import { approveTranslation } from "@/app/actions-translations";
import { publicText } from "@/lib/translation";
import { withTranslationColumns } from "@/lib/translation-column";

// "Generar 10 borradores" (draftDealAbouts) calls the AI once per deal: give the page's server actions up to
// 5 minutes; the action itself stops starting new drafts at 4 (ABOUT_TIME_BUDGET_MS)
export const maxDuration = 300;

type Shared = {
  id: number; title: string; url: string; code: string; discount: string; created_at: Date;
  store_name: string; handle: string | null;
};
type CommentRow = {
  id: number; parent_id: number | null; body: string; hidden: number; created_at: Date;
  reader_id: number; handle: string; status: string; title: string;
};

async function loadShared() {
  return (await sql()<Shared[]>`
    SELECT c.id, c.title, c.target_url AS url, c.code, c.discount, c.created_at, s.name AS store_name, r.handle
    FROM coupons c JOIN stores s ON s.id = c.store_id LEFT JOIN readers r ON r.id = c.shared_by
    WHERE c.shared_by IS NOT NULL AND c.review = 'pending'
    ORDER BY c.id DESC`).map((r) => ({ ...r }));
}

type Reported = { id: number; title: string; store_name: string; reports: number; last_at: Date };

// Live (not archived) coupons readers marked as expired, most recently reported first
async function loadReported() {
  return (await sql()<Reported[]>`
    SELECT c.id, c.title, s.name AS store_name, count(*)::int AS reports, max(e.at) AS last_at
    FROM expiry_reports e JOIN coupons c ON c.id = e.coupon_id JOIN stores s ON s.id = c.store_id
    WHERE c.archived = 0
    GROUP BY c.id, s.id
    ORDER BY max(e.at) DESC
    LIMIT 100`).map((r) => ({ ...r }));
}

type AboutDraft = { id: number; title: string; about: string; store_name: string };

async function loadAboutDrafts() {
  return (await sql()<AboutDraft[]>`
    SELECT c.id, c.title, c.about, s.name AS store_name
    FROM coupons c JOIN stores s ON s.id = c.store_id
    WHERE c.about_status = 'draft'
    ORDER BY c.id DESC`).map((r) => ({ ...r }));
}

type AutoTranslation = {
  id: number; title: string; description: string; title_es: string; description_es: string; translation_status: string;
  translated_from: string; store_name: string;
};

// The latest automatic translations still shown on the site (they translate the current original); none before
// npm run db:setup adds the columns
async function loadAutoTranslations(): Promise<AutoTranslation[]> {
  const rows = await withTranslationColumns(async (present) => (present ? sql()<AutoTranslation[]>`
    SELECT c.id, c.title, c.description, c.title_es, c.description_es, c.translation_status, c.translated_from, s.name AS store_name
    FROM coupons c JOIN stores s ON s.id = c.store_id
    WHERE c.translation_status = 'auto' AND c.archived = 0
    ORDER BY c.id DESC LIMIT 40` : []));
  return rows.filter((r) => publicText(r).title === r.title_es).slice(0, 20).map((r) => ({ ...r }));
}

async function loadComments() {
  return (await sql()<CommentRow[]>`
    SELECT k.id, k.parent_id, k.body, k.hidden, k.created_at, r.id AS reader_id, r.handle, r.status, c.title
    FROM comments k JOIN readers r ON r.id = k.reader_id JOIN coupons c ON c.id = k.coupon_id
    ORDER BY k.created_at DESC, k.id DESC LIMIT 100`).map((r) => ({ ...r }));
}

export default async function ModerationPage() {
  await requireEditor();
  await io();
  const [shared, comments, drafts, reported, translations] = await Promise.all([loadShared(), loadComments(), loadAboutDrafts(), loadReported(), loadAutoTranslations()]);

  return (
    <div className="space-y-8">
      <PageHeader title="Revisión" eyebrow="Lo que aportan los lectores y la IA, antes de publicarse" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Chollos compartidos</h2>
        {shared.length === 0 && <p className="text-sm text-neutral-500">No hay chollos pendientes de revisar.</p>}
        {shared.map((d) => (
          <div key={d.id} className={`${cardCls} space-y-3`}>
            <div>
              <p className="text-sm text-neutral-500">
                {d.store_name} · {d.handle ? `@${d.handle}` : "lector eliminado"} · {fmtDateTime(d.created_at)}
              </p>
              <p className="font-medium">{d.title}</p>
              <p className="text-sm">
                <a href={d.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-blue-700 underline dark:text-blue-400">{d.url}</a>
              </p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Código {d.code || "sin código"} · Descuento {d.discount || "sin indicar"}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <form action={publishShared}>
                <input type="hidden" name="id" value={d.id} />
                <button className={btnCls}>Publicar</button>
              </form>
              {/* the reader sees the reason on /cuenta; rejectShared accepts only these */}
              <form action={rejectShared} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={d.id} />
                <label className="sr-only" htmlFor={`reason-${d.id}`}>Motivo del rechazo</label>
                <select id={`reason-${d.id}`} name="reason" required defaultValue="" className={`${inputCls} w-auto`}>
                  <option value="" disabled>Motivo del rechazo</option>
                  {REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button className={btnSecondaryCls}>Rechazar</button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Avisos de caducado</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Chollos que algún lector ha marcado como caducados. Con 3 avisos el chollo muestra «Puede haber caducado».
        </p>
        {reported.length === 0 && <p className="text-sm text-neutral-500">No hay avisos de caducado.</p>}
        {reported.map((d) => (
          <div key={d.id} className={`${cardCls} space-y-3`}>
            <div>
              <p className="text-sm text-neutral-500">
                {d.store_name} · {d.reports === 1 ? "1 aviso" : `${d.reports} avisos`} · último {fmtDateTime(d.last_at)}
              </p>
              <a href={dealPath(d)} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline dark:text-blue-400">{d.title}</a>
            </div>
            <div className="flex gap-2">
              <form action={retireReported}>
                <input type="hidden" name="id" value={d.id} />
                <button className={btnCls}>Retirar</button>
              </form>
              <form action={dismissExpiryReports}>
                <input type="hidden" name="id" value={d.id} />
                <button className={btnSecondaryCls}>Sigue activo</button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Textos de chollos</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          La IA escribe un borrador de «Sobre este chollo» con los datos del cupón y de su tienda. Solo se publica cuando lo apruebas.
        </p>
        <DraftAboutsButton />
        {drafts.length === 0 && <p className="text-sm text-neutral-500">No hay borradores pendientes.</p>}
        {drafts.map((d) => (
          <div key={d.id} className={`${cardCls} space-y-3`}>
            <p className="text-sm text-neutral-500">
              {d.store_name} ·{" "}
              <a href={dealPath(d)} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline dark:text-blue-400">{d.title}</a>
            </p>
            <AboutDraftForm id={d.id} about={d.about} />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Traducciones automáticas</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Cupones que llegaron en otro idioma. La IA los traduce y la traducción sale en la web enseguida. Revisa las últimas.
        </p>
        {translations.length === 0 && <p className="text-sm text-neutral-500">No hay traducciones automáticas por revisar.</p>}
        {translations.map((d) => (
          <div key={d.id} className={`${cardCls} space-y-3`}>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div lang="">
                <p className="text-xs text-neutral-500">{d.store_name} · original</p>
                <p className="font-medium">{d.title}</p>
                {d.description && <p className="text-neutral-600 dark:text-neutral-400">{d.description}</p>}
              </div>
              <div>
                <p className="text-xs text-neutral-500">Traducción</p>
                <p className="font-medium">{d.title_es}</p>
                {d.description_es && <p className="text-neutral-600 dark:text-neutral-400">{d.description_es}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <form action={approveTranslation}>
                <input type="hidden" name="id" value={d.id} />
                <button className={btnCls}>Aprobar</button>
              </form>
              <Link href={`/panel/coupons?edit=${d.id}`} className={btnSecondaryCls}>Editar</Link>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Comentarios recientes</h2>
        {comments.length === 0 && <p className="text-sm text-neutral-500">Todavía no hay comentarios.</p>}
        {comments.map((k) => (
          <div key={k.id} className={`${cardCls} space-y-3 ${k.hidden ? "opacity-60" : ""}`}>
            <div>
              <p className="text-sm text-neutral-500">
                {k.title} · {k.parent_id ? "respuesta · " : ""}@{k.handle}{k.status === "blocked" ? " (bloqueado)" : ""} · {fmtDateTime(k.created_at)}
              </p>
              <p className="whitespace-pre-line text-sm">{k.body}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={setCommentHidden}>
                <input type="hidden" name="id" value={k.id} />
                <input type="hidden" name="hidden" value={k.hidden ? "0" : "1"} />
                <button className={btnSecondaryCls}>{k.hidden ? "Mostrar" : "Ocultar"}</button>
              </form>
              <form action={setReaderBlocked}>
                <input type="hidden" name="id" value={k.reader_id} />
                <input type="hidden" name="blocked" value={k.status === "blocked" ? "0" : "1"} />
                <button className={btnSecondaryCls}>{k.status === "blocked" ? "Desbloquear" : "Bloquear"} a @{k.handle}</button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
