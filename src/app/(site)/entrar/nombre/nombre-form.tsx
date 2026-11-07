"use client";

import { useActionState, useState } from "react";
import { handleInitial, handlePreview } from "@/lib/reader-entry";
import { chooseHandle } from "../../actions-reader";

// SiteEntrarVuelta board, step 3: a fixed "@" before the field and a live preview of how others will see it
export function NombreForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(chooseHandle, {});
  const [raw, setRaw] = useState("");
  const handle = handlePreview(raw);
  const describedBy = state.error ? "nombre-hint nombre-error" : "nombre-hint";
  return (
    <form action={formAction} className="entry-form">
      <input type="hidden" name="next" value={next} />
      <label className="entry-field">
        Nombre
        <span className="entry-input entry-input-at">
          <b aria-hidden="true">@</b>
          <input
            name="handle" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="tu_nombre"
            minLength={3} maxLength={20} pattern="[A-Za-z0-9_]{3,20}" required autoFocus
            value={raw} onChange={(e) => setRaw(e.target.value)}
            aria-invalid={state.error ? true : undefined} aria-describedby={describedBy}
          />
        </span>
      </label>
      <p id="nombre-hint" className="entry-muted">De 3 a 20 letras, números o _.</p>
      {state.error && <p id="nombre-error" role="alert" className="auth-error">{state.error}</p>}
      <div className="entry-preview">
        <span className="entry-av" aria-hidden="true">{handleInitial(handle)}</span>
        <span>Así te verán <span className="entry-handle">@{handle || "tu_nombre"}</span></span>
      </div>
      <button className="btn btn-primary entry-btn" disabled={pending}>{pending ? "Guardando…" : "Guardar y seguir"}</button>
    </form>
  );
}
