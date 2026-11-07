"use client";

import { Command } from "cmdk";
import { useRef, useState } from "react";
import { addPage } from "@/app/actions-pages";
import { Dialog } from "@/app/dialog";
import { btnCls } from "@/app/ui";
import { StoreMark } from "@/app/store-mark";

interface StoreOpt { slug: string; name: string; coupons: number; hasLogo: boolean }

// "+ Añadir tienda" on a client: a modal with a searchable list (shadcn Command); picking a store adds it
export function AddStoreButton({ client, stores }: { client: string; stores: StoreOpt[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const storeInput = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState("");

  function add(s: StoreOpt) {
    if (!storeInput.current || adding) return;
    storeInput.current.value = s.slug;
    setAdding(s.name);
    form.current?.requestSubmit(); // the action redirects to the new page's generator
  }

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={`${btnCls} min-h-10`}>+ Añadir tienda</button>
      <Dialog title="Añadir tienda" dialogRef={ref}>
        <form ref={form} action={addPage} className="flex flex-col">
          <input type="hidden" name="client" value={client} />
          <input ref={storeInput} type="hidden" name="store" />
          <Command loop className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-neutral-200 px-5 dark:border-neutral-800">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-neutral-400"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <Command.Input autoFocus placeholder="Buscar tienda…" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-neutral-500" />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2 text-sm">
              <Command.Empty className="px-2 py-8 text-center text-neutral-500">Ninguna tienda con ese nombre.</Command.Empty>
              {stores.map((s) => (
                <Command.Item
                  key={s.slug}
                  value={`${s.name} ${s.slug}`}
                  onSelect={() => add(s)}
                  disabled={Boolean(adding)}
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 data-[disabled=true]:cursor-wait data-[disabled=true]:opacity-50 data-[selected=true]:bg-neutral-100 dark:data-[selected=true]:bg-neutral-800"
                >
                  <StoreMark slug={s.slug} name={s.name} hasLogo={s.hasLogo} />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="text-xs text-neutral-500">{s.coupons} {s.coupons === 1 ? "cupón" : "cupones"}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
          <p role="status" className="border-t border-neutral-200 px-5 py-3 text-xs text-neutral-500 dark:border-neutral-800">
            {adding ? `Añadiendo ${adding} y abriendo su generador…` : "Elige una tienda: se crea su página en borrador y se abre el generador."}
          </p>
        </form>
      </Dialog>
    </>
  );
}
