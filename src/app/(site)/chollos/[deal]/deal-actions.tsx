"use client";

import { toggleSaved } from "../../actions-reader";

// Under "Ir a la tienda": two equal buttons, as in the SiteDeal board. Plain form posts, so they work without client JS.
export function DealActions({ couponId, back, saved }: { couponId: number; back: string; saved: boolean }) {
  return (
    <div className="dt-actions">
      <form action={toggleSaved}>
        <input type="hidden" name="coupon_id" value={couponId} />
        <input type="hidden" name="next" value={saved ? "0" : "1"} />
        <input type="hidden" name="back" value={back} />
        <button className="btn" type="submit" aria-pressed={saved}>{saved ? "Guardado" : "Guardar"}</button>
      </form>
    </div>
  );
}
