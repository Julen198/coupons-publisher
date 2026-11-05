"use client";

import { useActionState } from "react";
import { requestReaderLink } from "../actions-reader";

export function EntrarForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(requestReaderLink, {});
  if (state.sent) return <p role="status">Si el email es correcto, te hemos enviado un enlace. Caduca en 15 minutos.</p>;
  return (
    <form action={formAction} className="auth-form">
      <input type="hidden" name="next" value={next} />
      <label>
        Email
        <input type="email" name="email" autoComplete="email" required autoFocus />
      </label>
      {state.error && <p role="alert" className="auth-error">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Enviando…" : "Enviarme el enlace"}</button>
    </form>
  );
}
