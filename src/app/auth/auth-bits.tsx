import type { ReactNode } from "react";

export const authBtnCls =
  "flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-[15px] font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-80 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500";

export function AuthError({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-snug text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="mt-px shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
      <span><strong className="font-semibold">{title}</strong> {children}</span>
    </div>
  );
}

// Big icon + title + text, for the "link no longer works" outcomes
export function AuthNotice({ tone, icon, title, children }: { tone: "bad" | "ok"; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <span className={`flex size-14 items-center justify-center rounded-2xl ${tone === "bad" ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"}`}>{icon}</span>
      <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}
