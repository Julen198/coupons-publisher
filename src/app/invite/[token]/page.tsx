import { Suspense } from "react";
import { sql } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/auth";
import { AcceptInviteForm } from "./accept-form";

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite] = /^[0-9a-f]{64}$/.test(token)
    ? await sql()<{ name: string; email: string; role: Role }[]>`
        SELECT name, email, role FROM users WHERE invite_token = ${token} AND status = 'pending' AND invite_expires_at > now()`
    : [];

  if (!invite) {
    return (
      <>
        <h1 className="text-xl font-semibold">Invitación no válida</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">El enlace ha caducado o ya se usó. Pide a un administrador que te envíe uno nuevo.</p>
      </>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Hola, {invite.name}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Te han invitado como <strong>{ROLE_LABEL[invite.role]}</strong> con <span className="font-mono">{invite.email}</span>. Elige una contraseña para entrar.
        </p>
      </div>
      <AcceptInviteForm token={token} />
    </>
  );
}

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Tessera Coupons</span>
        <Suspense fallback={<p className="text-sm text-neutral-500">Comprobando invitación…</p>}>
          <Invite params={params} />
        </Suspense>
      </div>
    </main>
  );
}
