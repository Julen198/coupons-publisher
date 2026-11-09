"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setStoreState } from "@/app/actions-pages";

// Activa / Inactiva for one store of a client. Flips at once; the server action saves it and the page refreshes. A
// blocked store gets a disabled switch (it has to be unblocked first).
export function StoreSwitch({ client, store, label, on, blocked }: { client: string; store: string; label: string; on: boolean; blocked: boolean }) {
  const [shown, setShown] = useOptimistic(on);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const toggle = () =>
    start(async () => {
      setError("");
      setShown(!shown);
      const f = new FormData();
      f.set("client", client);
      f.set("store", store);
      f.set("action", shown ? "deactivate" : "activate");
      try {
        await setStoreState(f);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar"); // the optimistic state goes back on its own
      }
    });

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={shown}
        aria-label={label}
        title={blocked ? "Bloqueada: desbloquéala primero" : shown ? "Activa: pulsa para desactivar" : "Inactiva: pulsa para activar"}
        disabled={blocked || pending}
        onClick={toggle}
        className="flex min-h-11 min-w-11 items-center justify-center disabled:cursor-not-allowed"
      >
        <span className={`relative h-6 w-11 rounded-full transition-colors ${blocked ? "bg-neutral-200 dark:bg-neutral-800" : shown ? "bg-blue-700 dark:bg-blue-500" : "bg-neutral-300 dark:bg-neutral-700"} ${pending ? "opacity-70" : ""}`}>
          <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${shown ? "translate-x-5" : ""}`} />
        </span>
      </button>
      {error && <span role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</span>}
    </span>
  );
}
