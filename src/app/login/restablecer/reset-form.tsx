"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { resetPassword, type FormState } from "@/app/actions";
import { Spinner } from "@/app/auth/password-input";
import { AuthError, authBtnCls } from "@/app/auth/auth-bits";
import { NewPasswordFields } from "@/app/auth/new-password-fields";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(resetPassword, {});
  const [ready, setReady] = useState(false);
  const expired = state.error === "El enlace ha caducado o ya se usó.";
  if (expired) {
    return (
      <div className="flex flex-col gap-4">
        <AuthError title={state.error!}>Los enlaces duran 15 minutos y solo sirven una vez.</AuthError>
        <Link href="/login/recuperar" className={authBtnCls}>Pedir otro enlace</Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      {state.error && <AuthError title={state.error} />}
      <NewPasswordFields onReady={setReady} />
      <button disabled={pending} aria-disabled={!ready} aria-busy={pending} onClick={(e) => { if (!ready) e.preventDefault(); }} className={authBtnCls}>
        {pending && <Spinner />}
        {pending ? "Guardando…" : "Guardar contraseña y entrar"}
      </button>
    </form>
  );
}
