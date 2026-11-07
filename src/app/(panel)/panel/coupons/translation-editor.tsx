"use client";

import { startTransition, useActionState, useState } from "react";
import { saveTranslation, setTranslationSkipped, type TranslationState } from "@/app/actions-translations";
import { btnCls, btnSecondaryCls, inputCls } from "@/app/ui";
import type { TranslationDraft } from "@/lib/translation";

// The coupon's original next to its Spanish version. Controlled fields, submitted with startTransition so React 19
// doesn't reset them after the action; saving approves the text as the translation of the original as it is now.

const STATUS_TEXT: Record<TranslationDraft["status"], string> = {
  "": "Sin traducir todavía. Se traducirá tras la próxima sincronización de redes.",
  auto: "Traducción automática, ya visible en la web.",
  approved: "Traducción revisada por el equipo.",
  skip: "No se traduce. La web muestra el original.",
};

const statusText = (d: TranslationDraft) =>
  d.status !== "skip" && d.title_es && !d.fresh ? "El original ha cambiado. La web muestra el original hasta que se traduzca de nuevo o la guardes." : STATUS_TEXT[d.status];

export function TranslationEditor({ draft }: { draft: TranslationDraft }) {
  const [titleEs, setTitleEs] = useState(draft.title_es);
  const [descriptionEs, setDescriptionEs] = useState(draft.description_es);
  const [state, save, saving] = useActionState<TranslationState, FormData>((_prev, f) => saveTranslation(f), {});
  const [skipState, skip, skipping] = useActionState<TranslationState, FormData>((_prev, f) => setTranslationSkipped(f), {});
  const busy = saving || skipping;
  const error = state.error ?? skipState.error;
  const skipped = draft.status === "skip";

  const submitSkip = (value: "0" | "1") => {
    const f = new FormData();
    f.set("id", String(draft.id));
    f.set("skip", value);
    startTransition(() => skip(f));
  };

  return (
    <section aria-labelledby="translation-title" className="flex flex-col gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
      <div className="flex flex-col gap-1">
        <h3 id="translation-title" className="font-semibold">Traducción al español</h3>
        <p className="text-xs text-neutral-500">{statusText(draft)}</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          startTransition(() => save(f));
        }}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="id" value={draft.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-600 dark:text-neutral-400">{draft.label}</span>
            <div className="flex flex-1 flex-col gap-2 rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
              <p lang="" className="font-medium">{draft.title}</p>
              {draft.description && <p lang="" className="text-neutral-600 dark:text-neutral-400">{draft.description}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">Título en español</span>
              <input name="title_es" required maxLength={300} value={titleEs} onChange={(e) => setTitleEs(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">Condiciones en español</span>
              <textarea name="description_es" rows={4} maxLength={2000} value={descriptionEs} onChange={(e) => setDescriptionEs(e.target.value)} className={inputCls} />
            </label>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{error}</p>}
        {!error && state.saved && !saving && <p role="status" className="text-sm text-green-800 dark:text-green-300">Traducción guardada y aprobada.</p>}
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !titleEs.trim()} className={`${btnCls} min-h-11 disabled:opacity-50`}>{saving ? "Guardando…" : "Guardar y aprobar"}</button>
          <button type="button" disabled={busy} onClick={() => submitSkip(skipped ? "0" : "1")} className={`${btnSecondaryCls} min-h-11 disabled:opacity-50`}>
            {skipped ? "Volver a traducir" : "No traducir"}
          </button>
        </div>
      </form>
    </section>
  );
}
