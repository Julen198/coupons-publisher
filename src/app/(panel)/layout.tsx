import Link from "next/link";
import { Suspense } from "react";
import { Nav, NavList } from "@/app/nav";
import { getUser } from "@/lib/auth";
import { AccountSlot } from "./account-slot";

export default function PanelLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-wrap">
      <aside className="flex w-full flex-col gap-6 border-neutral-200 bg-neutral-50 px-4 py-6 md:sticky md:top-0 md:h-screen md:w-58 md:border-r dark:border-neutral-800 dark:bg-neutral-950">
        <Link href="/" className="flex items-center gap-2 px-3 text-[15px] font-bold whitespace-nowrap" aria-label="CuponLab, ir a la portada">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-blue-700 dark:text-blue-400">
            <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
            <path d="M10 9l4 6" />
          </svg>
          CuponLab
        </Link>
        <Suspense fallback={<NavList />}>
          <NavSlot />
        </Suspense>
        <div className="border-t border-neutral-200 pt-3 md:mt-auto dark:border-neutral-800">
          <Suspense fallback={<div className="h-11 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />}>
            <AccountSlot />
          </Suspense>
        </div>
      </aside>
      <main className="min-w-0 flex-1 basis-[560px] px-6 py-8 md:px-10">
        {/* every panel page reads the database at request time */}
        <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>{children}</Suspense>
      </main>
    </div>
  );
}

// admin-only entries (Costes de IA) need the user, which is read at request time
async function NavSlot() {
  const user = await getUser();
  return <Nav admin={user?.role === "admin"} />;
}
