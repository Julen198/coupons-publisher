"use client";

import Link from "next/link";
import { useRef } from "react";
import { accountHref } from "@/lib/account";
import { signOutReader } from "./actions-reader";
import { CloseIcon } from "./entrar/icons";

// Phones only (CSS): the reader's initial in a round button; it opens a bottom sheet with the account pages and Salir,
// so the handle and Salir don't take a second header row (SiteHeaderMobile board, step 3)
export function AccountMenu({ handle }: { handle: string | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();
  const name = handle ? `@${handle}` : "Tu cuenta";
  return (
    <>
      <button type="button" className="acct-btn" aria-label={`Tu cuenta, ${name}`} aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>
        {(handle ?? "?").charAt(0).toUpperCase()}
      </button>
      <dialog ref={ref} className="modal acct-sheet" aria-label="Tu cuenta" onClick={(e) => e.target === e.currentTarget && close()}>
        <span className="modal-grab" aria-hidden="true" />
        <p className="acct-me">
          <span className="acct-btn" aria-hidden="true">{(handle ?? "?").charAt(0).toUpperCase()}</span>
          <b>{name}</b>
        </p>
        <nav aria-label="Tu cuenta">
          <Link href={accountHref("compartidos")} onClick={close}>Mis chollos compartidos</Link>
          <Link href={accountHref("guardados")} onClick={close}>Guardados</Link>
          <Link href={accountHref("comentarios")} onClick={close}>Comentarios</Link>
        </nav>
        <form action={signOutReader}>
          <button type="submit" className="acct-out">Salir</button>
        </form>
        <button type="button" className="modal-x" aria-label="Cerrar" onClick={close}>
          <CloseIcon />
        </button>
      </dialog>
    </>
  );
}
