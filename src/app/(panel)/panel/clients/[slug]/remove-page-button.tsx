"use client";

import { useRef } from "react";
import { removePage } from "@/app/actions-pages";
import { Dialog } from "@/app/dialog";
import { btnSecondaryCls } from "@/app/ui";

interface RemovePageButtonProps {
  client: { slug: string; name: string };
  store: { slug: string; name: string };
  published: boolean;
}

export function RemovePageButton({ client, store, published }: RemovePageButtonProps) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="text-red-700 hover:underline dark:text-red-400">
        Quitar
      </button>
      <Dialog title={`Quitar ${store.name}`} dialogRef={ref}>
        <form action={removePage} className="flex flex-col gap-4 p-5 text-sm">
          <input type="hidden" name="client" value={client.slug} />
          <input type="hidden" name="store" value={store.slug} />
          <p>
            Se borra la página de <strong>{store.name}</strong> para <strong>{client.name}</strong>. Los cupones de la tienda no se tocan.
          </p>
          {published && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              Está publicada: si la tienen incrustada en su web, dejará de verse.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className={`${btnSecondaryCls} min-h-10`}>Cancelar</button>
            <button className="inline-flex min-h-10 items-center rounded-md bg-red-700 px-4 font-semibold text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500">
              Quitar página
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
