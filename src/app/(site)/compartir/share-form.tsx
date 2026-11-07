"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SHARE_LIMIT_PER_DAY } from "@/lib/community-rules";
import { shareDeal } from "../actions-reader";
import { OkNote } from "../ok-note";

// Field order and labels from the SiteEntrar board: the link first, then the store and the title, code and date side by side
export function ShareForm({ stores }: { stores: { slug: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(shareDeal, {});
  if (state.done) return <OkNote>Gracias. Lo revisamos y, si cumple las normas, lo publicamos en unas horas.</OkNote>;
  return (
    <form action={formAction} className="share-form">
      <label>
        Enlace del producto en la tienda
        <input name="url" type="url" required placeholder="https://www.pccomponentes.com/…" />
      </label>
      <label>
        Tienda
        <select name="store" required defaultValue="">
          <option value="" disabled>Elige una tienda</option>
          {stores.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
      </label>
      <label>
        Título
        <input name="title" required minLength={5} maxLength={120} placeholder="Samsung 990 PRO 2 TB a 129,90 €" />
      </label>
      <label>
        Descuento (si hay)
        <input name="discount" maxLength={40} placeholder="15 %" />
      </label>
      <div className="row2">
        <label>
          Código (si hay)
          <input name="code" className="mono" maxLength={40} autoCapitalize="characters" placeholder="CLAB15" />
        </label>
        <label>
          Caduca
          <input name="expires_at" type="date" />
        </label>
      </div>
      <label>
        Condiciones
        <textarea name="description" rows={3} maxLength={500} placeholder="Envío gratis desde 50 €, solo primer pedido…" />
      </label>
      {state.error && <p role="alert" className="auth-error">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Enviando…" : "Enviar para revisión"}</button>
      <p className="small">Máximo {SHARE_LIMIT_PER_DAY} chollos al día por cuenta. ¿No está tu tienda? <Link href="/contacto">Escríbenos</Link>.</p>
    </form>
  );
}
