import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Tessera Coupons</span>
          <h1 className="text-xl font-semibold">Iniciar sesión</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Entra con tu email y tu contraseña.</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
