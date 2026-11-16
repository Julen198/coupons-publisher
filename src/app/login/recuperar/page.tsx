import { AuthShell } from "@/app/auth/auth-shell";
import { ForgotPasswordForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell headline="Cada medio, sus cupones. Hechos a su medida.">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-bold tracking-tight">¿Has olvidado la contraseña?</h1>
          <p className="text-[15px] text-neutral-600 dark:text-neutral-400">Escribe tu email y te mandamos un enlace para elegir una nueva.</p>
        </div>
        <ForgotPasswordForm />
      </div>
    </AuthShell>
  );
}
