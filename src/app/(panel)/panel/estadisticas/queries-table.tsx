"use client";

import { useState } from "react";
import type { QueryRow } from "@/lib/stats";

// Google queries table: click a header to sort by it (a second click flips the order); the
// legend chip toggles showing only the queries close to the first page.
const NEAR_LABEL = "Cerca de 1.ª página";
const isNear = (position: number) => position >= 8 && position <= 30;
const NEAR_ROW_CLS = "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100";
const NEAR_CLS = "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200 whitespace-nowrap";
const n = (v: number) => Math.round(v).toLocaleString("es-ES");
const pct = (v: number) => `${(v * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const pos = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 });
const th = "px-3 py-2 font-semibold";
const td = "px-3 py-2 text-right tabular-nums";

type Key = "query" | "impressions" | "clicks" | "ctr" | "position";
type Dir = "asc" | "desc";
const ctr = (q: QueryRow) => (q.impressions ? q.clicks / q.impressions : 0);
const COLS: { key: Key; label: string; cls: string; first: Dir }[] = [
  { key: "query", label: "Búsqueda", cls: "pl-5 text-left", first: "asc" },
  { key: "impressions", label: "Impresiones", cls: "text-right", first: "desc" },
  { key: "clicks", label: "Clics", cls: "text-right", first: "desc" },
  { key: "ctr", label: "CTR", cls: "text-right", first: "desc" },
  // best position (lowest number) first
  { key: "position", label: "Posición", cls: "pr-5 text-right", first: "asc" },
];

function compare(a: QueryRow, b: QueryRow, key: Key) {
  if (key === "query") return a.query.localeCompare(b.query, "es");
  if (key === "ctr") return ctr(a) - ctr(b);
  return a[key] - b[key];
}

export function QueriesTable({ queries }: { queries: QueryRow[] }) {
  const [sort, setSort] = useState<{ key: Key; dir: Dir }>({ key: "impressions", dir: "desc" });
  const [onlyNear, setOnlyNear] = useState(false);
  const nearCount = queries.filter((q) => isNear(q.position)).length;
  const rows = queries
    .filter((q) => !onlyNear || isNear(q.position))
    .sort((a, b) => (sort.dir === "asc" ? 1 : -1) * compare(a, b, sort.key) || b.impressions - a.impressions);
  const by = (c: (typeof COLS)[number]) =>
    setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: c.first }));

  return (
    <>
      <p className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-5 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        <button
          type="button"
          onClick={() => setOnlyNear((v) => !v)}
          aria-pressed={onlyNear}
          disabled={nearCount === 0 && !onlyNear}
          title={onlyNear ? "Mostrar todas las búsquedas" : "Mostrar solo las búsquedas cerca de la 1.ª página"}
          className={`${NEAR_CLS} cursor-pointer ring-amber-700 hover:ring-1 disabled:cursor-default disabled:hover:ring-0 dark:ring-amber-300 ${onlyNear ? "ring-2 hover:ring-2" : ""}`}
        >
          {onlyNear ? `✓ ${NEAR_LABEL} (${nearCount})` : `${NEAR_LABEL} (${nearCount})`}
        </button>
        Las filas en amarillo salen entre la posición 8 y la 30 (final de la 1.ª página a la 3.ª): con una guía de tienda pueden subir a la primera página. Pulsa la etiqueta para ver solo esas.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
            <tr>
              {COLS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th key={c.key} className={`${th} ${c.cls}`} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button
                      type="button"
                      onClick={() => by(c)}
                      className={`inline-flex cursor-pointer items-center gap-1 hover:text-neutral-900 dark:hover:text-neutral-100 ${active ? "text-neutral-900 dark:text-neutral-100" : ""}`}
                    >
                      {c.label}
                      <span aria-hidden className={active ? "" : "opacity-30"}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.query} className={`border-t border-neutral-100 dark:border-neutral-800 ${isNear(q.position) ? NEAR_ROW_CLS : ""}`} title={isNear(q.position) ? `${NEAR_LABEL}: posición 8–30, una guía puede subirla a la primera página` : undefined}>
                <td className="px-3 py-2 pl-5 font-medium">{q.query}</td>
                <td className={td}>{n(q.impressions)}</td><td className={td}>{n(q.clicks)}</td>
                <td className={`${td} text-neutral-500`}>{q.impressions ? pct(ctr(q)) : "—"}</td>
                <td className={`${td} pr-5 font-semibold`}>{pos(q.position)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
