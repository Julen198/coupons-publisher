"use client";

import { useState } from "react";
import { authInputCls, PasswordInput } from "@/app/auth/password-input";

export const MIN_PASSWORD = 10; // matches MIN_PASSWORD_LENGTH on the server, which has the last word

// Live rules: what's still missing, in words (not only colour)
function Rule({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? "text-green-800 dark:text-green-300" : "text-neutral-600 dark:text-neutral-400"}`}>
      <span aria-hidden="true" className={`flex size-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${ok ? "bg-green-100 dark:bg-green-950" : "bg-neutral-100 dark:bg-neutral-800"}`}>{ok ? "✓" : "·"}</span>
      <span><span className="sr-only">{ok ? "Cumplido: " : "Pendiente: "}</span>{children}</span>
    </li>
  );
}

// "Contraseña" + "Repite la contraseña" + the two rules. Reports whether both pass, so the button can wait.
export function NewPasswordFields({ onReady }: { onReady: (ready: boolean) => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const longEnough = pw.length >= MIN_PASSWORD;
  const same = pw.length > 0 && pw === pw2;
  const update = (a: string, b: string) => onReady(a.length >= MIN_PASSWORD && a === b);
  return (
    <>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Contraseña nueva
        <PasswordInput name="password" required minLength={MIN_PASSWORD} autoFocus autoComplete="new-password" aria-describedby="pw-rules" value={pw} onChange={(e) => { setPw(e.target.value); update(e.target.value, pw2); }} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Repite la contraseña
        <input type="password" name="confirm" required minLength={MIN_PASSWORD} autoComplete="new-password" value={pw2} onChange={(e) => { setPw2(e.target.value); update(pw, e.target.value); }} className={authInputCls} />
      </label>
      <ul id="pw-rules" aria-live="polite" className="flex flex-col gap-1.5 text-[13px]">
        <Rule ok={longEnough}>{`Al menos ${MIN_PASSWORD} caracteres`}</Rule>
        <Rule ok={same}>Las dos contraseñas coinciden</Rule>
      </ul>
    </>
  );
}
