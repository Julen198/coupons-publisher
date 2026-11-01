"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { login, requestMagicLink, type FormState, type MagicLinkState } from "@/app/actions";
import { authInputCls, PasswordInput, Spinner } from "@/app/auth/password-input";
import { AuthError, authBtnCls } from "@/app/auth/auth-bits";

const linkBtnCls = "self-center text-sm font-medium text-blue-700 underline-offset-4 hover:underline dark:text-blue-400";

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "/";
  const [mode, setMode] = useState<"password" | "magic">("password");
  return mode === "password"
    ? <PasswordForm next={next} onSwitch={() => setMode("magic")} />
    : <MagicForm next={next} onSwitch={() => setMode("password")} />;
}

interface ModeProps {
  next: string;
  onSwitch: () => void;
}

function EmailField() {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      Email
      <input type="email" name="email" required autoFocus autoComplete="username" placeholder="tu@medio.es" className={authInputCls} />
    </label>
  );
}

function PasswordForm({ next, onSwitch }: ModeProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      {state.error && <AuthError title={state.error}>Revísalos e inténtalo de nuevo.</AuthError>}
      <EmailField />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Contraseña
        <PasswordInput name="password" required autoComplete="current-password" />
      </label>
      <button disabled={pending} aria-busy={pending} className={authBtnCls}>
        {pending && <Spinner />}
        {pending ? "Entrando…" : "Entrar"}
      </button>
      <button type="button" onClick={onSwitch} className={linkBtnCls}>Prefiero recibir un enlace por email</button>
    </form>
  );
}

function MagicForm({ next, onSwitch }: ModeProps) {
  const [state, formAction, pending] = useActionState<MagicLinkState, FormData>(requestMagicLink, {});
  if (state.sentTo) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3.5 text-sm leading-relaxed text-green-900 dark:border-green-900 dark:bg-green-950/60 dark:text-green-200">
          Si <strong className="font-semibold">{state.sentTo}</strong> tiene cuenta, te hemos enviado un enlace para entrar. Caduca en 15 minutos.
        </div>
        <button type="button" onClick={onSwitch} className={linkBtnCls}>Volver a entrar con contraseña</button>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      {state.error && <AuthError title={state.error} />}
      <EmailField />
      <button disabled={pending} aria-busy={pending} className={authBtnCls}>
        {pending && <Spinner />}
        {pending ? "Enviando…" : "Enviarme el enlace"}
      </button>
      <button type="button" onClick={onSwitch} className={linkBtnCls}>Entrar con contraseña</button>
    </form>
  );
}
