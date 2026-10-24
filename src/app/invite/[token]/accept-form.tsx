"use client";

import { useActionState, useState } from "react";
import { acceptInvite } from "@/app/actions-admin";
import type { FormState } from "@/lib/form";
import { AuthError, authBtnCls } from "@/app/auth/auth-bits";
import { authInputCls, PasswordInput, Spinner } from "@/app/auth/password-input";

const MIN = 10;

// Live rules: what's still missing, in words (not only colour), and the button waits until both pass
function Rule({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? "text-green-800 dark:text-green-300" : "text-neutral-600 dark:text-neutral-400"}`}>
      <span aria-hidden="true" className={`flex size-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${ok ? "bg-green-100 dark:bg-green-950" : "bg-neutral-100 dark:bg-neutral-800"}`}>{ok ? "✓" : "·"}</span>
      <span><span className="sr-only">{ok ? "Cumplido: " : "Pendiente: "}</span>{children}</span>
    </li>
  );
}

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(acceptInvite, {});
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const longEnough = pw.length >= MIN;
  const same = pw.length > 0 && pw === pw2;
  const ready = longEnough && same;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      {state.error && <AuthError title={state.error} />}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Contraseña
        <PasswordInput name="password" required minLength={MIN} autoFocus autoComplete="new-password" aria-describedby="pw-rules" value={pw} onChange={(e) => setPw(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Repite la contraseña
        <input type="password" name="confirm" required minLength={MIN} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={authInputCls} />
      </label>
      <ul id="pw-rules" aria-live="polite" className="flex flex-col gap-1.5 text-[13px]">
        <Rule ok={longEnough}>{`Al menos ${MIN} caracteres`}</Rule>
        <Rule ok={same}>Las dos contraseñas coinciden</Rule>
      </ul>
      <button
        disabled={pending}
        aria-disabled={!ready}
        onClick={(e) => { if (!ready) e.preventDefault(); }}
        className={authBtnCls}
      >
        {pending && <Spinner />}
        {pending ? "Creando tu cuenta…" : "Crear contraseña y entrar"}
      </button>
    </form>
  );
}
