import { Suspense } from "react";
import { AuthShell } from "@/app/auth/auth-shell";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthShell headline="Cada medio, sus cupones. Hechos a su medida.">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-bold tracking-tight">Entra en tu panel</h1>
          <p className="text-[15px] text-neutral-600 dark:text-neutral-400">Con tu contraseña o con un enlace que te enviamos por email.</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
        <div className="flex flex-col gap-2 border-t border-neutral-200 pt-5 text-[13px] leading-relaxed text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          <p><strong className="font-semibold text-neutral-800 dark:text-neutral-200">¿Sin cuenta?</strong> Las cuentas se crean por invitación: pídesela a un administrador de tu equipo.</p>
          <p><strong className="font-semibold text-neutral-800 dark:text-neutral-200">¿Olvidaste la contraseña?</strong> Un administrador puede enviarte un enlace nuevo desde Administración.</p>
        </div>
      </div>
    </AuthShell>
  );
}
