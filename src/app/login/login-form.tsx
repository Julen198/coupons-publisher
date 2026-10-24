"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { login, type FormState } from "@/app/actions";
import { authInputCls, PasswordInput, Spinner } from "@/app/auth/password-input";
import { AuthError, authBtnCls } from "@/app/auth/auth-bits";

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "/";
  const [state, formAction, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      {state.error && <AuthError title={state.error}>Revísalos e inténtalo de nuevo.</AuthError>}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <input type="email" name="email" required autoFocus autoComplete="username" placeholder="tu@medio.es" className={authInputCls} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Contraseña
        <PasswordInput name="password" required autoComplete="current-password" />
      </label>
      <button disabled={pending} aria-busy={pending} className={authBtnCls}>
        {pending && <Spinner />}
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
