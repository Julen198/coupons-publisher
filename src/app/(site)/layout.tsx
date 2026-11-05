import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { siteUrl } from "@/lib/site-text";

// The public deals site: indexable (the root layout keeps the panel out of search engines)
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "CuponLab: chollos y códigos descuento verificados", template: "%s | CuponLab" },
  description: "Chollos y códigos descuento comprobados en las tiendas españolas, con condiciones claras y fecha de caducidad.",
  robots: { index: true, follow: true },
  openGraph: { siteName: "CuponLab", locale: "es_ES", type: "website" },
};

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:gap-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="#1d4ed8" />
              <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="translate(4 4)">
                <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
                <path d="M10 9l4 6" />
              </g>
            </svg>
            <span>
              Cupon<span className="text-blue-700 dark:text-blue-400">Lab</span>
            </span>
          </Link>
          <nav aria-label="Secciones" className="flex gap-3 text-sm font-semibold whitespace-nowrap sm:gap-4 text-slate-600 dark:text-slate-300">
            <Link href="/" className="hover:text-blue-700 dark:hover:text-blue-400">Chollos</Link>
            <Link href="/tiendas" className="hover:text-blue-700 dark:hover:text-blue-400">Tiendas</Link>
            <Link href="/calendario" className="hover:text-blue-700 dark:hover:text-blue-400">Calendario</Link>
          </nav>
        </div>
      </header>
      {/* every page reads the database at request time */}
      <Suspense fallback={<p className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500">Cargando chollos…</p>}>{children}</Suspense>
      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-4 py-6 text-xs text-slate-500 dark:text-slate-400">
          <span>© CuponLab</span>
          <span>Algunos enlaces son de afiliado: si compras, la tienda nos paga una comisión y tu precio no cambia.</span>
        </div>
      </footer>
    </div>
  );
}
