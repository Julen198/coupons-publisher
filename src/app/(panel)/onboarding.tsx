import Link from "next/link";

interface Step {
  done: boolean;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

// First-run checklist on the dashboard: shown until the panel has its first published page
export function Onboarding({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  return (
    <section aria-labelledby="onb" className="overflow-hidden rounded-lg border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-200 px-5 py-4 dark:border-blue-900">
        <div>
          <h2 id="onb" className="font-semibold">Primeros pasos</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Del panel vacío a la primera página de cupones publicada en un medio.</p>
        </div>
        <span className="text-sm font-medium text-blue-900 tabular-nums dark:text-blue-200">{done} de {steps.length}</span>
      </div>
      <ol className="divide-y divide-blue-100 dark:divide-blue-900/60">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <span
              aria-hidden="true"
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                s.done ? "bg-green-700 text-white" : i === next ? "bg-blue-700 text-white" : "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
              }`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <span className="flex min-w-0 flex-[1_1_280px] flex-col">
              <span className={`text-sm font-medium ${s.done ? "text-neutral-500 line-through" : ""}`}>
                <span className="sr-only">{s.done ? "Hecho: " : "Pendiente: "}</span>{s.title}
              </span>
              <span className="text-xs text-neutral-600 dark:text-neutral-400">{s.detail}</span>
            </span>
            {!s.done && (
              <Link
                href={s.href}
                className={`flex min-h-9 items-center rounded-md px-3 text-sm font-medium ${
                  i === next ? "bg-blue-700 text-white hover:bg-blue-800" : "border border-neutral-300 hover:bg-white dark:border-neutral-700 dark:hover:bg-neutral-900"
                }`}
              >
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
