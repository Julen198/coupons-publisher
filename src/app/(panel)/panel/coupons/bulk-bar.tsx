"use client";

import { useEffect, useState } from "react";
import { archiveCoupons, verifyCoupons } from "@/app/actions";

const CHECKED = 'input[form="bulk"]:checked';

// Floating action bar for the row checkboxes (they belong to <form id="bulk">); only shown while something is checked
export function BulkBar() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    // the form resets after an action; read the count once the reset has applied
    const sync = () => setTimeout(() => setCount(document.querySelectorAll(CHECKED).length));
    document.addEventListener("change", sync);
    document.addEventListener("reset", sync, true);
    sync();
    return () => {
      document.removeEventListener("change", sync);
      document.removeEventListener("reset", sync, true);
    };
  }, []);

  const clear = () => {
    document.querySelectorAll<HTMLInputElement>(CHECKED).forEach((i) => (i.checked = false));
    setCount(0);
  };

  if (!count) return null;
  return (
    <div role="region" aria-label="Acciones con los seleccionados" className="fixed inset-x-4 bottom-6 z-20 flex justify-center">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-neutral-900 py-2 pr-2 pl-4 text-sm text-white shadow-2xl dark:bg-neutral-100 dark:text-neutral-900">
        <span className="mr-2 font-medium">{count} seleccionado{count > 1 ? "s" : ""}</span>
        <button form="bulk" formAction={verifyCoupons} className="min-h-9 rounded-md bg-white/10 px-3 hover:bg-white/20 dark:bg-neutral-900/10 dark:hover:bg-neutral-900/20">Marcar verificados</button>
        <button form="bulk" formAction={archiveCoupons} className="min-h-9 rounded-md bg-red-600 px-3 font-medium text-white hover:bg-red-500">Retirar de las páginas</button>
        <button type="button" onClick={clear} aria-label="Quitar selección" className="flex size-9 items-center justify-center rounded-md hover:bg-white/10 dark:hover:bg-neutral-900/10">✕</button>
      </div>
    </div>
  );
}
