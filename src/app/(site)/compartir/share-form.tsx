"use client";

import { useActionState } from "react";
import { shareDeal } from "../actions-reader";

export function ShareForm({ stores }: { stores: { slug: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(shareDeal, {});
  if (state.done) return <p role="status">Gracias. Lo revisamos y, si cumple las normas, lo publicamos en unas horas.</p>;
  return (
    <form action={formAction} className="share-form">
      <label>
        Tienda
        <select name="store" required defaultValue="">
          <option value="" disabled>Elige una tienda</option>
          {stores.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
        <span className="hint">¿No está tu tienda? Escríbenos en un comentario</span>
      </label>
      <label>
        Título
        <input name="title" required minLength={5} maxLength={120} placeholder="SSD 2 TB a 129 €" />
      </label>
      <label>
        Enlace a la oferta
        <input name="url" type="url" required placeholder="https://" />
      </label>
      <label>
        Código (opcional)
        <input name="code" maxLength={40} autoCapitalize="characters" />
      </label>
      <label>
        Descuento (opcional)
        <input name="discount" maxLength={40} placeholder="10%" />
      </label>
      <label>
        Descripción (opcional)
        <textarea name="description" rows={3} maxLength={500} />
      </label>
      <label>
        Caduca el (opcional)
        <input name="expires_at" type="date" />
      </label>
      {state.error && <p role="alert" className="auth-error">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Enviando…" : "Compartir chollo"}</button>
    </form>
  );
}
