import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { COVERAGE_LABEL, type Coverage } from "@/lib/page-status";

export const inputCls = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
// native color inputs collapse to a thin bar with text-input padding
export const colorCls = "h-11 w-full cursor-pointer rounded-md border border-neutral-300 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-900";
// primary action = the one accent colour (same as the design canvas); white on blue-600/700 passes AA
export const btnCls = "inline-flex items-center justify-center rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500";
export const btnSecondaryCls = "inline-flex items-center justify-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900";
export const cardCls = "rounded-lg border border-neutral-200 p-5 dark:border-neutral-800";

interface FieldProps extends ComponentProps<"input"> {
  label: string;
}

export function Field({ label, ...input }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-neutral-600 dark:text-neutral-400">{label}</span>
      <input className={inputCls} {...input} />
    </label>
  );
}

export const COVERAGE_CLS: Record<Coverage, string> = {
  live: "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100",
  stale: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  draft: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
  none: "border border-dashed border-neutral-400 text-neutral-600 dark:border-neutral-600 dark:text-neutral-400",
};

export function CoverageBadge({ coverage }: { coverage: Coverage }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${COVERAGE_CLS[coverage]}`}>{COVERAGE_LABEL[coverage]}</span>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-sm text-neutral-500">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}

export const fmtDateTime = (d: Date) =>
  d.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

interface PagerProps { from: number; to: number; total: number; page: number; pages: number; href: (page: number) => string }

// "26–50 de 102 · ← Anterior · Página 2 de 5 · Siguiente →" under a paginated table
export function Pager({ from, to, total, page, pages, href }: PagerProps) {
  if (!total) return null;
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
      <span className="text-neutral-600 dark:text-neutral-400">{from}–{to} de {total}</span>
      {pages > 1 && (
        <span className="flex items-center gap-2">
          <PagerLink href={page > 1 ? href(page - 1) : undefined}>← Anterior</PagerLink>
          <span className="px-1 text-neutral-600 dark:text-neutral-400">Página {page} de {pages}</span>
          <PagerLink href={page < pages ? href(page + 1) : undefined}>Siguiente →</PagerLink>
        </span>
      )}
    </nav>
  );
}

function PagerLink({ href, children }: { href?: string; children: ReactNode }) {
  const cls = "inline-flex min-h-10 items-center rounded-md border border-neutral-300 px-3 dark:border-neutral-700";
  return href ? <Link href={href} className={`${cls} hover:bg-neutral-50 dark:hover:bg-neutral-900`}>{children}</Link> : <span aria-disabled className={`${cls} opacity-40`}>{children}</span>;
}

// Shown next to "Filtrar" only while some filter is on; goes back to the unfiltered list
export function ClearFilters({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      Borrar filtros
    </Link>
  );
}
