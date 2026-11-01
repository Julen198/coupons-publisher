import { AuthShell } from "@/app/auth/auth-shell";
import { MagicConfirmForm } from "./confirm-form";

// The emailed link lands here; signing in needs the button press (a POST), so link prefetchers can't burn the token
export default async function MagicLinkPage({ searchParams }: PageProps<"/login/magic">) {
  const { token, next } = await searchParams;
  return (
    <AuthShell headline="Cada medio, sus cupones. Hechos a su medida.">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-bold tracking-tight">Entra en tu panel</h1>
          <p className="text-[15px] text-neutral-600 dark:text-neutral-400">Pulsa el botón para terminar de iniciar sesión.</p>
        </div>
        <MagicConfirmForm token={typeof token === "string" ? token : ""} next={typeof next === "string" ? next : "/"} />
      </div>
    </AuthShell>
  );
}
