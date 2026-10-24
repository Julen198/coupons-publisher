"use client";

import type { ReactNode, RefObject } from "react";

// Native <dialog>: focus trap, Escape and backdrop for free
export function Dialog({ title, dialogRef, children }: { title: string; dialogRef: RefObject<HTMLDialogElement | null>; children: ReactNode }) {
  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      className="m-auto w-[min(520px,calc(100vw-32px))] rounded-2xl border border-neutral-200 bg-white p-0 text-left text-neutral-900 shadow-2xl backdrop:bg-slate-900/50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()} className="flex size-10 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">✕</button>
      </div>
      {children}
    </dialog>
  );
}
