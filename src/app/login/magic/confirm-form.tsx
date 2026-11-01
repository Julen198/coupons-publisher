"use client";

import Link from "next/link";
import { useActionState } from "react";
import { consumeMagicLink, type FormState } from "@/app/actions";
import { Spinner } from "@/app/auth/password-input";
import { AuthError, authBtnCls } from "@/app/auth/auth-bits";

export function MagicConfirmForm({ token, next }: { token: string; next: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(consumeMagicLink, {});
  if (state.error) {
    return (
      <div className="flex flex-col gap-4">
        <AuthError title={state.error}>Los enlaces duran 15 minutos y solo sirven una vez.</AuthError>
        <Link href="/login" className={authBtnCls}>Pedir otro enlace</Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="next" value={next} />
      <button disabled={pending} aria-busy={pending} autoFocus className={authBtnCls}>
        {pending && <Spinner />}
        {pending ? "Entrando…" : "Entrar en CuponLab"}
      </button>
    </form>
  );
}
