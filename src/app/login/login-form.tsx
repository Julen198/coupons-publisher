"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { login, type FormState } from "@/app/actions";
import { btnCls, inputCls } from "@/app/ui";

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "/";
  const [state, formAction, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">Email</span>
        <input type="email" name="email" required autoFocus autoComplete="username" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">Contraseña</span>
        <input type="password" name="password" required autoComplete="current-password" className={inputCls} />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{state.error}</p>}
      <button disabled={pending} className={`${btnCls} min-h-11 disabled:opacity-50`}>{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
