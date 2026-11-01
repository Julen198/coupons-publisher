import { Suspense } from "react";
import { AuthShell } from "@/app/auth/auth-shell";
import { MagicConfirmForm } from "./confirm-form";

async function Confirm({ searchParams }: { searchParams: PageProps<"/login/magic">["searchParams"] }) {
  const { token, next } = await searchParams;
  return <MagicConfirmForm token={typeof token === "string" ? token : ""} next={typeof next === "string" ? next : "/"} />;
}

// The emailed link lands here; signing in needs the button press (a POST), so link prefetchers can't burn the token
export default function MagicLinkPage({ searchParams }: PageProps<"/login/magic">) {
  return (
    <AuthShell headline="Cada medio, sus cupones. Hechos a su medida.">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-bold tracking-tight">Entra en tu panel</h1>
          <p className="text-[15px] text-neutral-600 dark:text-neutral-400">Pulsa el botón para terminar de iniciar sesión.</p>
        </div>
        <Suspense>
          <Confirm searchParams={searchParams} />
        </Suspense>
      </div>
    </AuthShell>
  );
}
