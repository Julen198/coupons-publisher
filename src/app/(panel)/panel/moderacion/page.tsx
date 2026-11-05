import { publishShared, rejectShared, setCommentHidden, setReaderBlocked } from "@/app/actions-community";
import { btnCls, btnSecondaryCls, cardCls, fmtDateTime, PageHeader } from "@/app/ui";
import { requireEditor } from "@/lib/auth";
import { io } from "next/cache";
import { sql } from "@/lib/db";

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

async function loadComments() {
  return (await sql()<CommentRow[]>`
    SELECT k.id, k.parent_id, k.body, k.hidden, k.created_at, r.id AS reader_id, r.handle, r.status, c.title
    FROM comments k JOIN readers r ON r.id = k.reader_id JOIN coupons c ON c.id = k.coupon_id
    ORDER BY k.created_at DESC, k.id DESC LIMIT 100`).map((r) => ({ ...r }));
}

export default async function ModerationPage() {
  await requireEditor();
  await io();
  const [shared, comments] = await Promise.all([loadShared(), loadComments()]);

  return (
    <div className="space-y-8">
      <PageHeader title="Moderación" eyebrow="Lo que aportan los lectores" />

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
            <div className="flex gap-2">
              <form action={publishShared}>
                <input type="hidden" name="id" value={d.id} />
                <button className={btnCls}>Publicar</button>
              </form>
              <form action={rejectShared}>
                <input type="hidden" name="id" value={d.id} />
                <button className={btnSecondaryCls}>Rechazar</button>
              </form>
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
