"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type MagicLinkState } from "@/app/actions";
import { authInputCls, Spinner } from "@/app/auth/password-input";
import { AuthError, authBtnCls } from "@/app/auth/auth-bits";

const linkCls = "self-center text-sm font-medium text-blue-700 underline-offset-4 hover:underline dark:text-blue-400";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<MagicLinkState, FormData>(requestPasswordReset, {});
  if (state.sentTo) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3.5 text-sm leading-relaxed text-green-900 dark:border-green-900 dark:bg-green-950/60 dark:text-green-200">
          Si <strong className="font-semibold">{state.sentTo}</strong> tiene cuenta, te hemos enviado un enlace para elegir una contraseña nueva. Caduca en 15 minutos. Si no lo ves, mira en spam.
        </div>
        <Link href="/login" className={linkCls}>Volver a iniciar sesión</Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && <AuthError title={state.error} />}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <input type="email" name="email" required autoFocus autoComplete="username" placeholder="tu@medio.es" className={authInputCls} />
      </label>
      <button disabled={pending} aria-busy={pending} className={authBtnCls}>
        {pending && <Spinner />}
        {pending ? "Enviando…" : "Enviarme el enlace"}
      </button>
      <Link href="/login" className={linkCls}>Volver a iniciar sesión</Link>
    </form>
  );
}
