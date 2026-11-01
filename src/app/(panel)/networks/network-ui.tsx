"use client";

import { useActionState, useRef, useState } from "react";
import { deleteNetworkAccount, saveNetworkAccount, syncNetworks, type SyncState } from "@/app/actions-networks";
import type { FormState } from "@/lib/form";
import type { CredentialField } from "@/lib/networks/types";
import { btnCls, btnSecondaryCls, Field, inputCls } from "@/app/ui";
import { Dialog } from "@/app/dialog";

export interface NetworkOption { id: string; label: string; where: string; fields: CredentialField[] }
export interface AccountDefaults { network: string; owner: string; values: Record<string, string> }

// "Sincronizar" for one account (id) or all of them; the result stays under the button
export function SyncButton({ id, label = "Sincronizar", primary = false }: { id?: number; label?: string; primary?: boolean }) {
  const [state, action, pending] = useActionState<SyncState, FormData>(syncNetworks, {});
  return (
    <form action={action} className="flex flex-col items-start gap-1.5">
      {id !== undefined && <input type="hidden" name="id" value={id} />}
      <button disabled={pending} className={`${primary ? btnCls : btnSecondaryCls} min-h-10 disabled:opacity-60`}>
        {pending ? "Sincronizando…" : label}
      </button>
      {state.result && <p role="status" className="whitespace-pre-line text-xs text-green-800 dark:text-green-300">{state.result}</p>}
      {state.error && <p role="alert" className="whitespace-pre-line text-xs text-red-700 dark:text-red-300">{state.error}</p>}
    </form>
  );
}

export function DeleteAccountButton({ id, label }: { id: number; label: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" onClick={() => setAsking(true)} className="min-h-10 px-2 text-sm text-red-700 hover:underline dark:text-red-300">Desconectar</button>;
  }
  return (
    <form action={deleteNetworkAccount} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="button" onClick={() => setAsking(false)} className={`${btnSecondaryCls} min-h-10`}>Cancelar</button>
      <button className="min-h-10 rounded-md bg-red-700 px-3 text-sm font-semibold text-white" aria-label={`Desconectar ${label}`}>Sí, desconectar</button>
    </form>
  );
}

// Connect a new account or edit one (defaults). Secrets are never sent back: blank = keep the saved one.
export function AccountDialog({ networks, clients, defaults, trigger }: {
  networks: NetworkOption[];
  clients: { id: number; name: string }[];
  defaults?: AccountDefaults;
  trigger: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [network, setNetwork] = useState(defaults?.network ?? networks[0].id);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, f) => {
    const r = await saveNetworkAccount(prev, f);
    if (!r.error) ref.current?.close();
    return r;
  }, {});
  const net = networks.find((n) => n.id === network) ?? networks[0];
  const editing = Boolean(defaults);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={editing ? `${btnSecondaryCls} min-h-10` : `${btnCls} min-h-10`}>{trigger}</button>
      <Dialog title={editing ? `Editar cuenta de ${net.label}` : "Conectar una red"} dialogRef={ref}>
        <form action={action} className="flex flex-col gap-4 p-5">
          {editing ? (
            <>
              <input type="hidden" name="network" value={network} />
              <input type="hidden" name="owner" value={defaults?.owner ?? ""} />
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">Red</span>
                <select name="network" value={network} onChange={(e) => setNetwork(e.target.value)} className={inputCls}>
                  {networks.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">De quién es la cuenta</span>
                <select name="owner" defaultValue="" className={inputCls}>
                  <option value="">Nuestra cuenta</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name} (cuenta propia del medio)</option>)}
                </select>
              </label>
            </>
          )}
          {net.fields.map((field) => (
            <div key={`${net.id}-${field.name}`} className="flex flex-col gap-1">
              <Field
                label={field.label}
                name={field.name}
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                defaultValue={field.secret ? "" : (defaults?.values[field.name] ?? "")}
                placeholder={field.secret && editing ? "Sin cambios" : ""}
                required={!(field.secret && editing)}
              />
              {field.help && <p className="text-xs text-neutral-500">{field.help}</p>}
            </div>
          ))}
          <p className="text-xs text-neutral-500">Dónde encontrarlo: {net.where}. Se guarda cifrado.</p>
          {state.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className={`${btnSecondaryCls} min-h-10`}>Cancelar</button>
            <button disabled={pending} className={`${btnCls} min-h-10 disabled:opacity-60`}>{pending ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
