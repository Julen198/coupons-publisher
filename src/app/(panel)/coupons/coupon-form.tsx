"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveCoupon, type FormState } from "@/app/actions";
import { btnCls, Field, inputCls } from "@/app/ui";
import { Combobox } from "@/app/combobox";

export interface CouponDraft {
  id?: number;
  store_id: number;
  kind: "code" | "deal";
  title: string;
  code: string;
  discount: string;
  description: string;
  target_url: string;
  expires_at: string;
  verified: boolean;
}

interface CouponFormProps {
  initial: CouponDraft;
  stores: { id: number; name: string; website: string }[];
  back: string; // /coupons URL with the current filters, to return to after saving or closing
}

export function CouponForm({ initial, stores, back }: CouponFormProps) {
  const [c, setC] = useState(initial);
  const [state, formAction, saving] = useActionState<FormState, FormData>(saveCoupon, {});
  const set = (key: keyof CouponDraft) => (e: { target: { value: string } }) => setC({ ...c, [key]: e.target.value });
  const isNew = !initial.id;

  return (
    <aside aria-labelledby="coupon-form-title" className="flex max-w-md min-w-0 flex-1 basis-80 flex-col gap-4 rounded-lg border border-neutral-200 p-5 shadow-lg dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <h2 id="coupon-form-title" className="text-lg font-semibold">{isNew ? "Nuevo cupón" : "Editar cupón"}</h2>
        <Link href={back} aria-label="Cerrar" className="flex size-10 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">✕</Link>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-neutral-500">Así se verá en las páginas</span>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-neutral-900">
          <span className="min-w-12 text-center text-lg font-bold text-blue-900">{c.discount || "—"}</span>
          <span className="flex flex-1 basis-36 flex-col">
            <span className="text-sm font-semibold">{c.title || "Título del cupón"}</span>
            <span className={`text-xs ${c.verified ? "text-green-700" : "text-neutral-500"}`}>{c.verified ? "✔ Verificado" : "Sin verificar"}</span>
          </span>
          <span className="rounded-md bg-blue-900 px-3 py-2 text-sm font-semibold text-white">{c.kind === "code" ? "Ver cupón" : "Ver descuento"}</span>
        </div>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        {initial.id && <input type="hidden" name="id" value={initial.id} />}
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="kind" value={c.kind} />

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Tienda</span>
          <Combobox
            name="store_id"
            label="Tienda"
            defaultValue={String(c.store_id)}
            placeholder="Elige una tienda"
            searchPlaceholder="Buscar tienda…"
            emptyText="Ninguna tienda con ese nombre."
            options={stores.map((s) => ({ value: String(s.id), label: s.name }))}
            onChange={(v) => {
              const store = stores.find((s) => s.id === Number(v));
              // new coupons default their link to the store's homepage
              setC({ ...c, store_id: Number(v), target_url: isNew && store ? store.website : c.target_url });
            }}
          />
        </div>

        <div role="group" aria-label="Tipo" className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          {(["code", "deal"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={c.kind === k}
              onClick={() => setC({ ...c, kind: k })}
              className={`min-h-10 rounded-md text-sm ${c.kind === k ? "bg-white font-medium shadow-sm dark:bg-neutral-950" : "text-neutral-600 dark:text-neutral-400"}`}
            >
              {k === "code" ? "Con código" : "Oferta sin código"}
            </button>
          ))}
        </div>

        <Field label="Título" name="title" required placeholder="Código descuento de 10€" value={c.title} onChange={set("title")} />
        <div className="grid grid-cols-2 gap-3">
          {c.kind === "code" && (
            <Field label="Código" name="code" required placeholder="SAVE10" className={`${inputCls} font-mono uppercase`} value={c.code} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })} />
          )}
          <Field label="Descuento" name="discount" placeholder="10€ / 15%" value={c.discount} onChange={set("discount")} />
        </div>
        <Field label="Descripción" name="description" placeholder="Condiciones en una línea" value={c.description} onChange={set("description")} />
        <Field label="URL destino" name="target_url" type="url" required value={c.target_url} onChange={set("target_url")} />
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="Caduca" name="expires_at" type="date" value={c.expires_at} onChange={set("expires_at")} />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="verified" checked={c.verified} onChange={(e) => setC({ ...c, verified: e.target.checked })} className="size-5" />
            Verificado
          </label>
        </div>
        <p className="text-xs text-neutral-500">El enlace se envuelve con el Awin ID de cada medio al publicar.</p>

        {state.error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{state.error}</p>}
        <div className="flex gap-2">
          <button disabled={saving} className={`${btnCls} min-h-12 flex-1 disabled:opacity-50`}>
            {saving ? "Guardando…" : isNew ? "Añadir cupón" : "Guardar cambios"}
          </button>
          <Link href={back} className="flex min-h-12 items-center rounded-md border border-neutral-300 px-4 text-sm dark:border-neutral-700">Cancelar</Link>
        </div>
      </form>
    </aside>
  );
}
