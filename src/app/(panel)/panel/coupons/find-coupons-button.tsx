"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/app/dialog";
import { btnCls, btnSecondaryCls } from "@/app/ui";

interface StoreOpt { id: number; name: string; coupons: number }
type Scope = "empty" | "all";
type Found = { added?: number; error?: string; blocked?: boolean };

const PARALLEL = 3;

// Looks for each store's current coupons on the web (one request per store, a few at a time) and shows progress.
// Finds land as "Sin verificar" and stay off public pages until someone verifies them.
export function FindCouponsButton({ stores, label = "Buscar en internet" }: { stores: StoreOpt[]; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const stop = useRef(false);
  const router = useRouter();
  const single = stores.length === 1;
  const empty = stores.filter((s) => s.coupons === 0);
  const [scope, setScope] = useState<Scope>(empty.length ? "empty" : "all");
  const [run, setRun] = useState<{ total: number; done: number; added: number; failed: string[]; running: boolean; stopped: boolean; blocked?: string } | null>(null);

  async function start() {
    const queue = [...(single || scope === "all" ? stores : empty)];
    stop.current = false;
    setRun({ total: queue.length, done: 0, added: 0, failed: [], running: true, stopped: false });
    const worker = async () => {
      for (let s = queue.shift(); s && !stop.current; s = queue.shift()) {
        const res = await fetch("/api/find-coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId: s.id }) })
          .then((r) => r.json() as Promise<Found>)
          .catch((): Found => ({ error: "sin conexión" }));
        const name = s.name;
        if (res.blocked) {
          // over the monthly AI budget: stop every worker, nothing else will go through
          stop.current = true;
          setRun((r) => r && { ...r, stopped: true, blocked: res.error });
          return;
        }
        setRun((r) => r && { ...r, done: r.done + 1, added: r.added + (res.added ?? 0), failed: res.error ? [...r.failed, name] : r.failed });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    setRun((r) => r && { ...r, running: false });
    router.refresh();
  }

  const pct = run ? Math.round((run.done / Math.max(run.total, 1)) * 100) : 0;
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={btnSecondaryCls}>{label}</button>
      <Dialog title={single ? `Buscar cupones de ${stores[0].name}` : "Buscar cupones en internet"} dialogRef={ref}>
        <div className="flex flex-col gap-4 p-5 text-sm">
          <p className="text-neutral-600 dark:text-neutral-400">
            La IA busca en webs de cupones españolas los códigos y ofertas vigentes de cada tienda. Lo que encuentre entra como
            <strong> sin verificar</strong> y no sale en las páginas de los clientes hasta que lo verifiques.
          </p>
          {!single && !run && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-medium">¿Qué tiendas?</legend>
              <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === "empty"} onChange={() => setScope("empty")} disabled={!empty.length} /> Solo las que no tienen cupones ({empty.length})</label>
              <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} /> Todas ({stores.length})</label>
              <span className="text-xs text-neutral-500">Tarda unos 15 s por tienda, {PARALLEL} a la vez.</span>
            </fieldset>
          )}
          {run && (
            <div className="flex flex-col gap-2" role="status">
              <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div className="h-full bg-blue-700 transition-[width] dark:bg-blue-500" style={{ width: `${pct}%` }} />
              </div>
              <p>
                {run.done} de {run.total} tiendas · <strong>{run.added}</strong> cupones encontrados
                {run.running ? "…" : run.stopped ? " · parado" : " · terminado"}
              </p>
              {run.blocked && <p className="text-red-800 dark:text-red-300">{run.blocked}</p>}
              {run.failed.length > 0 && <p className="text-amber-800 dark:text-amber-300">Sin respuesta: {run.failed.join(", ")}</p>}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {run?.running ? (
              <button type="button" onClick={() => { stop.current = true; setRun((r) => r && { ...r, stopped: true }); }} className={`${btnSecondaryCls} min-h-10`}>Parar</button>
            ) : run ? (
              <>
                <button type="button" onClick={() => setRun(null)} className={`${btnSecondaryCls} min-h-10`}>Otra búsqueda</button>
                {run.added > 0 && <Link href="/panel/coupons?status=pending" onClick={() => ref.current?.close()} className={`${btnCls} min-h-10`}>Revisar {run.added} cupones</Link>}
              </>
            ) : (
              <button type="button" onClick={start} className={`${btnCls} min-h-10`}>Empezar</button>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
