"use client";

import { useActionState, useState } from "react";
import { approveAbout, discardAbout, draftDealAbouts, type AboutDraftsState } from "@/app/actions-community";
import { btnCls, btnSecondaryCls, inputCls } from "@/app/ui";
import { ABOUT_MAX, ABOUT_MIN, draftsDoneMessage } from "@/lib/deal-about";

export function DraftAboutsButton() {
  const [state, action, pending] = useActionState<AboutDraftsState>(draftDealAbouts, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button disabled={pending} className={btnCls}>{pending ? "Generando… (puede tardar unos minutos)" : "Generar 10 borradores"}</button>
      {!pending && state.drafted !== undefined && !state.error && (
        <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
          {draftsDoneMessage(state.drafted, !!state.stoppedForTime)}
        </p>
      )}
      {!pending && state.error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{state.error}</p>}
    </form>
  );
}

export function AboutDraftForm({ id, about }: { id: number; about: string }) {
  const [state, action, pending] = useActionState(approveAbout, {});
  const [text, setText] = useState(about);
  const length = text.trim().length;
  const fits = length >= ABOUT_MIN && length <= ABOUT_MAX;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`about-${id}`} className="sr-only">Texto del chollo</label>
      <textarea id={`about-${id}`} name="about" rows={7} value={text} onChange={(e) => setText(e.target.value)} className={inputCls} />
      <p className={`text-xs ${fits ? "text-neutral-500" : "text-red-800 dark:text-red-300"}`}>
        {length} caracteres (entre {ABOUT_MIN} y {ABOUT_MAX})
      </p>
      {state.error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{state.error}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className={btnCls}>Aprobar</button>
        <button formAction={discardAbout} disabled={pending} className={btnSecondaryCls}>Descartar</button>
      </div>
    </form>
  );
}
