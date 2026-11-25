"use client";

import { useState } from "react";
import type { QueryRow } from "@/lib/stats";

// Google and Bing queries table (Bing's columns beside Google's, "—" when Bing doesn't list that search): click a header to sort by it (a second click flips the order); the
// legend chip toggles showing only the queries close to the first page. Sorting and the filter
// work over every query of the period; the table shows PAGE rows at a time with "Ver más".
const NEAR_LABEL = "Cerca de 1.ª página";
const isNear = (position: number) => position >= 8 && position <= 30;
const nOr = (v: number | null) => (v == null ? "—" : n(v));
const NEAR_ROW_CLS = "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100";
const NEAR_CLS = "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200 whitespace-nowrap";
const n = (v: number) => Math.round(v).toLocaleString("es-ES");
const pct = (v: number) => `${(v * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const pos = (v: number | null) => (!v ? "—" : v.toLocaleString("es-ES", { maximumFractionDigits: 1 }));
const th = "px-3 py-2 font-semibold";
const td = "px-3 py-2 text-right tabular-nums";
const PAGE = 25;

type Key = "query" | "impressions" | "clicks" | "ctr" | "position" | "bImpressions" | "bClicks" | "bPosition";
type Dir = "asc" | "desc";
const ctr = (q: QueryRow) => (q.impressions ? q.clicks / q.impressions : 0);
const G = "text-blue-800 dark:text-blue-300";
const B = "text-teal-800 dark:text-teal-300";
const COLS: { key: Key; label: string; cls: string; first: Dir }[] = [
  { key: "query", label: "Búsqueda", cls: "pl-5 text-left", first: "asc" },
  { key: "impressions", label: "Impr. Google", cls: `text-right ${G}`, first: "desc" },
  { key: "clicks", label: "Clics Google", cls: `text-right ${G}`, first: "desc" },
  { key: "ctr", label: "CTR Google", cls: `text-right ${G}`, first: "desc" },
  // best position (lowest number) first
  { key: "position", label: "Pos. Google", cls: `text-right ${G}`, first: "asc" },
  { key: "bImpressions", label: "Impr. Bing", cls: `text-right ${B}`, first: "desc" },
  { key: "bClicks", label: "Clics Bing", cls: `text-right ${B}`, first: "desc" },
  { key: "bPosition", label: "Pos. Bing", cls: `pr-5 text-right ${B}`, first: "asc" },
];

// A missing value (no Bing row, no Google position) has no order of its own: it always goes last, whichever way
const valueOf = (q: QueryRow, key: Exclude<Key, "query">): number | null => {
  if (key === "ctr") return q.impressions ? ctr(q) : null;
  if (key === "position") return q.position || null;
  return q[key];
};
function sortRows(rows: QueryRow[], key: Key, dir: Dir) {
  const sign = dir === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    if (key === "query") return sign * a.query.localeCompare(b.query, "es");
    const x = valueOf(a, key), y = valueOf(b, key);
    if (x == null || y == null) return x == null && y == null ? b.impressions - a.impressions : x == null ? 1 : -1;
    return sign * (x - y) || b.impressions - a.impressions;
  });
}

export function QueriesTable({ queries }: { queries: QueryRow[] }) {
  const [sort, setSort] = useState<{ key: Key; dir: Dir }>({ key: "impressions", dir: "desc" });
  const [onlyNear, setOnlyNear] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const nearCount = queries.filter((q) => isNear(q.position)).length;
  const rows = sortRows(queries.filter((q) => !onlyNear || isNear(q.position)), sort.key, sort.dir);
  const visible = rows.slice(0, shown);
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
        <table className="w-full min-w-[840px] text-sm">
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
            {visible.map((q) => (
              <tr key={q.query} className={`border-t border-neutral-100 dark:border-neutral-800 ${isNear(q.position) ? NEAR_ROW_CLS : ""}`} title={isNear(q.position) ? `${NEAR_LABEL}: posición 8–30, una guía puede subirla a la primera página` : undefined}>
                <td className="px-3 py-2 pl-5 font-medium">{q.query}</td>
                <td className={td}>{n(q.impressions)}</td><td className={td}>{n(q.clicks)}</td>
                <td className={`${td} text-neutral-500`}>{q.impressions ? pct(ctr(q)) : "—"}</td>
                <td className={`${td} font-semibold`}>{pos(q.position)}</td>
                <td className={`${td} border-l border-neutral-100 dark:border-neutral-800`}>{nOr(q.bImpressions)}</td><td className={td}>{nOr(q.bClicks)}</td>
                <td className={`${td} pr-5 font-semibold`}>{pos(q.bPosition)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PAGE && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 px-5 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          <span>Mostrando {Math.min(shown, rows.length)} de {rows.length} búsquedas</span>
          <span className="flex gap-3">
            {shown < rows.length && (
              <>
                <button type="button" onClick={() => setShown((v) => v + PAGE)} className="cursor-pointer font-semibold text-neutral-900 hover:underline dark:text-neutral-100">Ver {Math.min(PAGE, rows.length - shown)} más</button>
                <button type="button" onClick={() => setShown(rows.length)} className="cursor-pointer font-semibold text-neutral-900 hover:underline dark:text-neutral-100">Ver todas</button>
              </>
            )}
            {shown > PAGE && <button type="button" onClick={() => setShown(PAGE)} className="cursor-pointer hover:underline">Ver menos</button>}
          </span>
        </div>
      )}
    </>
  );
}
