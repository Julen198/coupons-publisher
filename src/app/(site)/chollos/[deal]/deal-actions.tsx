"use client";

import { useActionState } from "react";
import { reportExpired, toggleSaved } from "../../actions-reader";

type Props = { couponId: number; back: string; saved: boolean; reported: boolean };

// Under "Ir a la tienda": two equal buttons, as in the SiteDeal board. Form posts, so Guardar works without client JS.
export function DealActions({ couponId, back, saved, reported }: Props) {
  const [state, reportAction, pending] = useActionState(reportExpired, {});
  const done = reported || !!state.done;
  return (
    <div className="dt-actions">
      <form action={toggleSaved}>
        <input type="hidden" name="coupon_id" value={couponId} />
        <input type="hidden" name="next" value={saved ? "0" : "1"} />
        <input type="hidden" name="back" value={back} />
        <button className="btn" type="submit" aria-pressed={saved}>{saved ? "Guardado" : "Guardar"}</button>
      </form>
      <form action={reportAction}>
        <input type="hidden" name="coupon_id" value={couponId} />
        <input type="hidden" name="back" value={back} />
        <button className="btn" type="submit" disabled={done || pending}>{done ? "Avisado, gracias" : "Marcar como caducado"}</button>
      </form>
      {state.error && <p role="alert" className="auth-error">{state.error}</p>}
    </div>
  );
}
