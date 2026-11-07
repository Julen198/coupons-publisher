"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "../entrar/icons";

// A native <dialog> (a bottom sheet on phones): focus trap, Esc and the backdrop come from the browser; closing goes back to the
// page underneath, or to `closeTo` when there is none (a page opened from the email shows the home behind it)
// `openOnLoad`: the server sends it already open, so the card shows on first paint and works without JS; on mount it is
// upgraded to a modal (close + showModal), and that internal close is not taken as the reader closing it
export function Modal({ children, labelledBy, at = "/entrar", closeTo, openOnLoad = false }: { children: ReactNode; labelledBy: string; at?: string; closeTo?: string; openOnLoad?: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const upgrading = useRef(false);
  const path = usePathname();
  const here = path === at;
  useEffect(() => {
    const d = ref.current;
    if (!here || !d) return;
    if (d.open && !d.matches(":modal")) {
      upgrading.current = true;
      d.close();
    }
    if (!d.open) d.showModal();
  }, [here]);
  // a parallel slot keeps its last page after the reader navigates elsewhere: once the URL isn't /entrar, the modal goes
  // (a catch-all slot page would do it too, but it captured /login and the whole panel)
  if (!here) return null;
  return (
    <dialog
      ref={ref}
      className="modal entry-card"
      aria-labelledby={labelledBy}
      open={openOnLoad || undefined}
      onClose={() => {
        // the close event comes after the upgrade above: skip it once
        if (upgrading.current) {
          upgrading.current = false;
          return;
        }
        if (closeTo) router.replace(closeTo);
        else router.back();
      }}
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
