"use client";

import { useActionState } from "react";
import { importStores, type ImportStoresState } from "@/app/actions";
import { btnCls, inputCls } from "@/app/ui";
import { NETWORKS } from "@/lib/affiliate";

export function BulkStoresForm() {
  const [state, action, pending] = useActionState<ImportStoresState, FormData>(importStores, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-neutral-500">Pega lo que tengas: nombres sueltos, columnas de Excel o un correo. La IA saca cada tienda y su web; el merchant ID solo si viene en el texto.</p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">Red de todas</span>
        <select name="network" defaultValue="awin" className={inputCls}>
          {NETWORKS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
        <span className="text-xs text-neutral-500">En otras redes, el enlace de seguimiento se pega luego en cada tienda.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="sr-only">Lista de tiendas</span>
        {/* remount after each import so it shows only the lines that still need fixing */}
        <textarea
          key={`${state.imported ?? ""}-${state.rejected ?? ""}`}
          defaultValue={state.rejected}
          name="list"
          rows={7}
          required
          spellCheck={false}
          placeholder={"Temu\nMediaMarkt\nZalando, zalando.es, 14563"}
          className={`${inputCls} font-mono text-xs`}
        />
      </label>
      <button disabled={pending} className={`${btnCls} min-h-11`}>{pending ? "Leyendo la lista…" : "Añadir tiendas"}</button>
      {state.error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{state.error}</p>}
      {state.imported !== undefined && (
        <div role="status" className="flex flex-col gap-1 text-sm">
          <p className="font-medium text-green-800 dark:text-green-300">{state.imported} tienda(s) añadidas.</p>
          {!!state.guessed?.length && (
            <p className="text-neutral-600 dark:text-neutral-400">Webs deducidas por la IA, revísalas: {state.guessed.join(" · ")}</p>
          )}
          {state.problems?.map((p) => <p key={p} className="text-amber-800 dark:text-amber-300">{p}</p>)}
        </div>
      )}
    </form>
  );
}
