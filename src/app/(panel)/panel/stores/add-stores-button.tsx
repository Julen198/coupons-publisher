"use client";

import { useActionState, useRef, useState } from "react";
import { createStore, type FormState } from "@/app/actions";
import { Dialog } from "@/app/dialog";
import { btnCls, Field } from "@/app/ui";
import { BulkStoresForm } from "./bulk-stores-form";
import { NetworkFields } from "./network-fields";

const TABS = [
  { id: "one", label: "Una tienda" },
  { id: "many", label: "Varias a la vez" },
] as const;

export function AddStoresButton() {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("one");
  const [state, action, pending] = useActionState<FormState, FormData>(createStore, {});
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={`${btnCls} min-h-11`}>+ Añadir tiendas</button>
      <Dialog title="Añadir tiendas" dialogRef={ref}>
        <div className="flex flex-col gap-4 p-5">
          <div role="tablist" aria-label="Cómo añadir" className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className="min-h-9 rounded-md text-sm font-medium text-neutral-600 aria-selected:bg-white aria-selected:text-neutral-900 aria-selected:shadow-sm dark:text-neutral-300 dark:aria-selected:bg-neutral-950 dark:aria-selected:text-neutral-100"
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "one" ? (
            <form action={action} className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre" name="name" required placeholder="Decathlon" />
              <Field label="Web" name="website" type="url" required placeholder="https://www.decathlon.es" />
              <NetworkFields />
              {state.error && <p role="alert" className="text-sm text-red-800 sm:col-span-2 dark:text-red-300">{state.error}</p>}
              <button disabled={pending} className={`${btnCls} min-h-11 sm:col-span-2`}>{pending ? "Creando…" : "Crear tienda"}</button>
            </form>
          ) : (
            <BulkStoresForm />
          )}
        </div>
      </Dialog>
    </>
  );
}
