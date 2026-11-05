"use client";

import { useActionState } from "react";
import { chooseHandle } from "../../actions-reader";

export function NombreForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(chooseHandle, {});
  return (
    <form action={formAction} className="auth-form">
      <input type="hidden" name="next" value={next} />
      <label>
        Nombre de usuario
        <input name="handle" autoComplete="username" minLength={3} maxLength={20} pattern="[A-Za-z0-9_]{3,20}" required autoFocus />
      </label>
      <p className="small">De 3 a 20 letras, números o guiones bajos.</p>
      {state.error && <p role="alert" className="auth-error">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button>
    </form>
  );
}
