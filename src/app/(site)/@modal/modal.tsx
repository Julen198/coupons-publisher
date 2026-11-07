"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

// A native <dialog>: focus trap, Esc and the backdrop come from the browser; closing goes back to the page underneath
export function Modal({ children, labelledBy }: { children: ReactNode; labelledBy: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal panel auth-card"
      aria-labelledby={labelledBy}
      onClose={() => router.back()}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
    >
      {children}
      {/* after the content so showModal focuses the form's first field; CSS puts it top right */}
      <button type="button" className="modal-x" aria-label="Cerrar" onClick={() => ref.current?.close()}>×</button>
    </dialog>
  );
}
