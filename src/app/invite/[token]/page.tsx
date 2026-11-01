import Link from "next/link";
import { Suspense } from "react";
import { sql } from "@/lib/db";
import { ROLE_DESCRIPTION, ROLE_LABEL, type Role } from "@/lib/auth";
import { AuthShell } from "@/app/auth/auth-shell";
import { AuthNotice, authBtnCls } from "@/app/auth/auth-bits";
import { AcceptInviteForm } from "./accept-form";

const ROLE_BADGE: Record<Role, string> = {
  admin: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
  editor: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  viewer: "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

type InviteRow = { name: string; email: string; role: Role; client_ids: number[]; expired: boolean };

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // accepted invites lose their token, so "already used" and "never existed" read the same
  const [invite] = /^[0-9a-f]{64}$/.test(token)
    ? await sql()<InviteRow[]>`
        SELECT name, email, role, client_ids, invite_expires_at <= now() AS expired
        FROM users WHERE invite_token = ${token} AND status = 'pending'`
    : [];

  if (!invite || invite.expired) {
    return (
      <AuthNotice
        tone="bad"
        title={invite ? "Esta invitación ha caducado" : "Este enlace ya no sirve"}
        icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /><path d="M3 3l18 18" /></svg>}
      >
        <p className="text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-400">
          {invite
            ? `Las invitaciones duran 7 días. Pide a quien te invitó que te envíe un enlace nuevo desde Administración.`
            : "O ya se usó (las invitaciones son de un solo uso) o no es correcto. Si aún no tienes contraseña, pide un enlace nuevo a un administrador."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/login" className={`${authBtnCls} px-5`}>Ir a iniciar sesión</Link>
          <span className="text-[13px] text-neutral-600 dark:text-neutral-400">¿Ya creaste tu contraseña? Entra con ella.</span>
        </div>
      </AuthNotice>
    );
  }

  const clients = invite.role === "admin" || invite.client_ids.length === 0
    ? []
    : await sql()<{ name: string }[]>`SELECT name FROM clients WHERE id = ANY(${invite.client_ids}) ORDER BY lower(name)`;
  const first = invite.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <span className="self-start rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">Invitación a CuponLab</span>
        <h1 className="text-[26px] font-bold tracking-tight">Hola, {first}. Crea tu contraseña</h1>
        <p className="text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-400">
          Entrarás con <strong className="font-semibold text-neutral-900 dark:text-neutral-100">{invite.email}</strong>. Es lo único que falta para empezar.
        </p>
      </div>

      <dl className="flex flex-col gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3.5 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-neutral-600 dark:text-neutral-400">Rol</dt>
          <dd><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${ROLE_BADGE[invite.role]}`}>{ROLE_LABEL[invite.role]}</span></dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-neutral-600 dark:text-neutral-400">Medios</dt>
          <dd className="flex flex-wrap justify-end gap-1.5">
            {invite.role === "admin" ? <span className="text-sm">Todos</span> : clients.length ? clients.map((c) => (
              <span key={c.name} className="rounded-md bg-neutral-200/70 px-2 py-0.5 text-xs dark:bg-neutral-800">{c.name}</span>
            )) : <span className="text-sm text-neutral-500">Ninguno todavía</span>}
          </dd>
        </div>
        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{ROLE_DESCRIPTION[invite.role]}</p>
      </dl>

      <AcceptInviteForm token={token} />
    </div>
  );
}

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <AuthShell headline="Te estábamos esperando para completar el mosaico.">
      <Suspense fallback={<p className="text-sm text-neutral-500">Comprobando la invitación…</p>}>
        <Invite params={params} />
      </Suspense>
    </AuthShell>
  );
}
