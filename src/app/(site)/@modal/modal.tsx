"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "../entrar/icons";

// A native <dialog> (a bottom sheet on phones): focus trap, Esc and the backdrop come from the browser; closing goes back to the page underneath
export function Modal({ children, labelledBy }: { children: ReactNode; labelledBy: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  const here = path === "/entrar";
  useEffect(() => {
    const d = ref.current;
    if (here && d && !d.open) d.showModal();
  }, [here]);
  // a parallel slot keeps its last page after the reader navigates elsewhere: once the URL isn't /entrar, the modal goes
  // (a catch-all slot page would do it too, but it captured /login and the whole panel)
  if (!here) return null;
  return (
    <dialog
      ref={ref}
      className="modal entry-card"
      aria-labelledby={labelledBy}
      onClose={() => router.back()}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
    >
      {/* the bottom sheet's grab handle (phones only, CSS) */}
      <span className="modal-grab" aria-hidden="true" />
      {children}
      {/* after the content so showModal focuses the form's first field; CSS puts it top right */}
      <button type="button" className="modal-x" aria-label="Cerrar" onClick={() => ref.current?.close()}>
        <CloseIcon />
      </button>
    </dialog>
  );
}
