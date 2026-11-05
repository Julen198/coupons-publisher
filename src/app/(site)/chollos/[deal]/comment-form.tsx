"use client";

import { useActionState, useEffect, useRef } from "react";
import { postComment } from "../../actions-reader";

export function CommentForm({ couponId }: { couponId: number }) {
  const [state, formAction, pending] = useActionState(postComment, {});
  const form = useRef<HTMLFormElement>(null);
  // empty the box once a comment went through (no error returned)
  useEffect(() => {
    if (state.posted) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={formAction} className="cm-form">
      <input type="hidden" name="coupon_id" value={couponId} />
      <label htmlFor="cm-text" className="small">Escribe un comentario</label>
      <textarea id="cm-text" name="body" placeholder="¿Te ha funcionado? ¿Has visto un precio mejor?" minLength={2} maxLength={1000} required />
      {state.error && <p role="alert" className="auth-error">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Publicando…" : "Publicar comentario"}</button>
    </form>
  );
}
