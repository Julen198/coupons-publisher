"use client";

import { useActionState, useRef, useState, useSyncExternalStore } from "react";
import { cancelInvite, importCoupons, inviteUser, regenerateInvite, updateUser, wipeAllData, type InviteState } from "@/app/actions-admin";
import type { Role } from "@/lib/auth";
import type { FormState } from "@/lib/form";
import { btnCls, btnSecondaryCls, Field, inputCls } from "@/app/ui";
import { Dialog } from "@/app/dialog";

type ClientOpt = { id: number; name: string };

const ROLE_OPTS: { role: Role; label: string; hint: string }[] = [
  { role: "admin", label: "Administrador", hint: "Todo, incluida la administración." },
  { role: "editor", label: "Editor", hint: "Edita cupones, tiendas y páginas de sus clientes." },
  { role: "viewer", label: "Lector", hint: "Solo ve resumen, páginas y clics de sus clientes." },
];

const useOrigin = () => useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");


function RoleAndClients({ role, setRole, clients, selected }: { role: Role; setRole: (r: Role) => void; clients: ClientOpt[]; selected: number[] }) {
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm text-neutral-600 dark:text-neutral-400">Rol</legend>
        {ROLE_OPTS.map((o) => (
          <label key={o.role} className="flex cursor-pointer flex-col gap-0.5 rounded-lg border border-neutral-200 p-3 text-sm has-[:checked]:border-2 has-[:checked]:border-blue-700 has-[:checked]:bg-blue-50 dark:border-neutral-800 dark:has-[:checked]:border-blue-400 dark:has-[:checked]:bg-blue-950">
            <span className="flex items-center gap-2 font-semibold">
              <input type="radio" name="role" value={o.role} checked={role === o.role} onChange={() => setRole(o.role)} className="size-4" />
              {o.label}
            </span>
            <span className="pl-6 text-xs text-neutral-600 dark:text-neutral-400">{o.hint}</span>
          </label>
        ))}
      </fieldset>
      {role !== "admin" && (
        <fieldset className="flex flex-col gap-1 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <legend className="px-1 text-sm text-neutral-600 dark:text-neutral-400">Clientes a los que tiene acceso</legend>
          {clients.length === 0 && <p className="py-2 text-sm text-amber-700 dark:text-amber-400">Aún no hay clientes. Crea uno antes de invitar a editores o lectores.</p>}
          {clients.map((c) => (
            <label key={c.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" name="clients" value={c.id} defaultChecked={selected.includes(c.id)} className="size-4" />
              {c.name}
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

function InviteLink({ state, onDone }: { state: InviteState; onDone: () => void }) {
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  const link = `${origin}${state.invitePath}`;
  return (
    <div className="flex flex-col gap-3 px-5 py-5">
      <p className="text-sm">
        {state.emailed
          ? <>Le hemos enviado la invitación a <strong>{state.email}</strong> por email. Si no le llega, cópiale este enlace: con él elige su contraseña. Caduca en 7 días.</>
          : <>Invitación creada para <strong>{state.email}</strong>, pero no pudimos enviar el email. Envíale este enlace: con él elige su contraseña. Caduca en 7 días.</>}
      </p>
      <div className="flex gap-2">
        <input readOnly value={link} aria-label="Enlace de invitación" onFocus={(e) => e.target.select()} className={`${inputCls} font-mono text-xs`} />
        <button
          type="button"
          onClick={async () => {
            try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* blocked: the field is selectable */ }
          }}
          className={`${btnSecondaryCls} min-h-10 whitespace-nowrap`}
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <div className="flex justify-end"><button type="button" onClick={onDone} className={`${btnCls} min-h-10`}>Listo</button></div>
    </div>
  );
}

export function InviteButton({ clients }: { clients: ClientOpt[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [role, setRole] = useState<Role>("editor");
  const [dismissed, setDismissed] = useState(""); // invite link already shown and closed
  // controlled so a validation error doesn't wipe what was typed (React resets forms after actions)
  const [who, setWho] = useState({ name: "", email: "" });
  const [state, formAction, pending] = useActionState<InviteState, FormData>(inviteUser, {});
  const fresh = state.invitePath && state.invitePath !== dismissed ? state : null;

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={`${btnCls} min-h-11`}>+ Invitar usuario</button>
      <Dialog title="Invitar usuario" dialogRef={ref}>
        {fresh ? (
          <InviteLink state={fresh} onDone={() => { ref.current?.close(); setDismissed(fresh.invitePath!); setWho({ name: "", email: "" }); }} />
        ) : (
          <form key={dismissed} action={formAction} className="flex flex-col gap-4 px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre" name="name" required placeholder="Ana Ruiz" value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} />
              <Field label="Email" name="email" type="email" required placeholder="ana@medio.es" value={who.email} onChange={(e) => setWho({ ...who, email: e.target.value })} />
            </div>
            <RoleAndClients role={role} setRole={setRole} clients={clients} selected={[]} />
            {state.error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{state.error}</p>}
            <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <button type="button" onClick={() => ref.current?.close()} className={`${btnSecondaryCls} min-h-11`}>Cancelar</button>
              <button disabled={pending} className={`${btnCls} min-h-11 disabled:opacity-50`}>{pending ? "Creando…" : "Crear invitación"}</button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

interface EditUser { id: number; name: string; email: string; role: Role; client_ids: number[]; status: "pending" | "active" | "disabled" }

export function EditUserButton({ user, clients, isMe }: { user: EditUser; clients: ClientOpt[]; isMe: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [role, setRole] = useState<Role>(user.role);
  const [state, formAction, pending] = useActionState<FormState & { saved?: boolean }, FormData>(updateUser, {});
  const [inviteState, inviteAction, invitePending] = useActionState<InviteState, FormData>(regenerateInvite, {});
  const [cancelState, cancelAction, cancelPending] = useActionState<FormState, FormData>(cancelInvite, {});
  const [confirmCancel, setConfirmCancel] = useState(false);

  return (
    <>
      <button type="button" aria-label={`Editar ${user.name}`} onClick={() => ref.current?.showModal()} className="inline-flex size-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">✎</button>
      <Dialog title={`Editar ${user.name}`} dialogRef={ref}>
        <form action={formAction} className="flex flex-col gap-4 px-5 py-5">
          <input type="hidden" name="id" value={user.id} />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{user.email}</p>
          <RoleAndClients role={role} setRole={setRole} clients={clients} selected={user.client_ids} />
          {user.status !== "pending" && !isMe && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="status" value="disabled" defaultChecked={user.status === "disabled"} className="size-4" />
              Desactivado (no puede entrar; cierra sus sesiones)
            </label>
          )}
          {state.error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{state.error}</p>}
          {state.saved && !state.error && !pending && <p role="status" className="text-sm text-green-700 dark:text-green-400">Cambios guardados</p>}
          <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <button type="button" onClick={() => ref.current?.close()} className={`${btnSecondaryCls} min-h-11`}>Cerrar</button>
            <button disabled={pending} className={`${btnCls} min-h-11 disabled:opacity-50`}>{pending ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
        {user.status === "pending" && (
          <div className="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            {inviteState.invitePath ? (
              <InviteLink state={inviteState} onDone={() => ref.current?.close()} />
            ) : (
              <div className="flex flex-col gap-3">
                <form action={inviteAction} className="flex flex-wrap items-center justify-between gap-3">
                  <input type="hidden" name="id" value={user.id} />
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">¿No le llegó? Le enviamos un enlace nuevo por email (el anterior deja de funcionar).</span>
                  <button disabled={invitePending} className={`${btnSecondaryCls} min-h-10`}>{invitePending ? "Enviando…" : "Reenviar invitación"}</button>
                </form>
                <form action={cancelAction} className="flex flex-wrap items-center justify-between gap-3">
                  <input type="hidden" name="id" value={user.id} />
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">{confirmCancel ? "¿Seguro? Su enlace dejará de funcionar." : "¿Ya no hace falta? Borra la invitación."}</span>
                  {confirmCancel ? (
                    <span className="flex gap-2">
                      <button type="button" onClick={() => setConfirmCancel(false)} className={`${btnSecondaryCls} min-h-10`}>No</button>
                      <button disabled={cancelPending} className="min-h-10 rounded-md bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{cancelPending ? "Cancelando…" : "Sí, cancelar"}</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmCancel(true)} className={`${btnSecondaryCls} min-h-10 text-red-800 dark:text-red-300`}>Cancelar invitación</button>
                  )}
                </form>
              </div>
            )}
            {(inviteState.error || cancelState.error) && <p role="alert" className="mt-2 text-sm text-red-800 dark:text-red-300">{inviteState.error || cancelState.error}</p>}
          </div>
        )}
      </Dialog>
    </>
  );
}

export function ImportCouponsForm() {
  const [state, formAction, pending] = useActionState<FormState & { imported?: number; problems?: string[] }, FormData>(importCoupons, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm dark:border-neutral-700 dark:bg-neutral-900">
        <span><strong>Elige el archivo CSV</strong> o arrástralo aquí</span>
        <input type="file" name="file" accept=".csv,text/csv" required className="text-xs" />
      </label>
      <button disabled={pending} className={`${btnSecondaryCls} min-h-10 self-start disabled:opacity-50`}>{pending ? "Importando…" : "Importar"}</button>
      {state.error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{state.error}</p>}
      {state.imported !== undefined && (
        <div role="status" className="flex flex-col gap-1 text-sm">
          <p className="text-green-700 dark:text-green-400">{state.imported} cupón(es) importados.</p>
          {state.problems?.length ? (
            <ul className="max-h-40 list-disc overflow-auto pl-5 text-amber-800 dark:text-amber-300">{state.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          ) : null}
        </div>
      )}
    </form>
  );
}

// Two steps: reveal, then type BORRAR (checked again on the server)
export function WipeDataForm() {
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="min-h-10 rounded-md border border-red-300 px-4 text-sm font-medium text-red-800 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950">
        Borrar todos los datos
      </button>
    );
  }
  return (
    <form action={wipeAllData} className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm text-red-900 dark:text-red-200">
        Escribe BORRAR para confirmar
        <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus className={`${inputCls} w-32`} />
      </label>
      <button type="button" onClick={() => { setAsking(false); setTyped(""); }} className={`${btnSecondaryCls} min-h-10`}>Cancelar</button>
      <button disabled={typed !== "BORRAR"} className="min-h-10 rounded-md bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-40">Sí, borrar todo</button>
    </form>
  );
}
