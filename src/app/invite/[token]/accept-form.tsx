"use client";

import { useActionState } from "react";
import { acceptInvite } from "@/app/actions-admin";
import type { FormState } from "@/lib/form";
import { btnCls, inputCls } from "@/app/ui";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(acceptInvite, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">Contraseña (mín. 10 caracteres)</span>
        <input type="password" name="password" required minLength={10} autoFocus autoComplete="new-password" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">Repite la contraseña</span>
        <input type="password" name="confirm" required minLength={10} autoComplete="new-password" className={inputCls} />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{state.error}</p>}
      <button disabled={pending} className={`${btnCls} min-h-11 disabled:opacity-50`}>{pending ? "Creando cuenta…" : "Crear contraseña y entrar"}</button>
    </form>
  );
}
