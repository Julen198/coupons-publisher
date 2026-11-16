import { Suspense } from "react";
import { AuthShell } from "@/app/auth/auth-shell";
import { ResetPasswordForm } from "./reset-form";

async function Reset({ searchParams }: { searchParams: PageProps<"/login/restablecer">["searchParams"] }) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" ? token : ""} />;
}

// The emailed reset link lands here. The token is only checked (and burnt) when the new password is posted, so a
// mail scanner that opens the link changes nothing.
export default function ResetPasswordPage({ searchParams }: PageProps<"/login/restablecer">) {
  return (
    <AuthShell headline="Cada medio, sus cupones. Hechos a su medida.">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-bold tracking-tight">Elige una contraseña nueva</h1>
          <p className="text-[15px] text-neutral-600 dark:text-neutral-400">Al guardarla entrarás en tu panel y se cerrará la sesión en tus otros dispositivos.</p>
        </div>
        <Suspense>
          <Reset searchParams={searchParams} />
        </Suspense>
      </div>
    </AuthShell>
  );
}
