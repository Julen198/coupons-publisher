"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/lib/catalog";
import { signOutReader } from "./actions-reader";
import { SeoToggle } from "./seo-panel";

// undefined = not known yet (the Suspense fallback); null = signed out
export type HeaderReader = { handle: string | null } | null;

const LOGO = (
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#1d4ed8" />
    <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="translate(4 4)">
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M10 9l4 6" />
    </g>
  </svg>
);

// "Todos" plus one tab per category; the current one is the home page with that ?cat= ("" = Todos)
const SECTIONS = [{ slug: "", label: "Todos" }, ...CATEGORIES].map((c) => ({ ...c, href: c.slug ? `/?cat=${c.slug}` : "/" }));

// Pages with a feed of deals (home, categories, search, a store) skip straight to it; the rest to their content
const hasFeed = (path: string) => path === "/" || path.startsWith("/tiendas/");

function Shell({ path, cat, q, reader }: { path: string; cat: string; q: string; reader?: HeaderReader }) {
  return (
    <header className="top">
      <a className="skip" href={hasFeed(path) ? "#chollos" : "#contenido"}>
        {hasFeed(path) ? "Saltar a los chollos" : "Saltar al contenido"}
      </a>
      <div className="wrap">
        <Link className="logo" href="/" aria-label="CuponLab, inicio">
          {LOGO}
          <span>
            Cupon<b>Lab</b>
          </span>
        </Link>
        <form className="search" action="/" role="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <label htmlFor="q" className="sr-only">Buscar</label>
          <input id="q" name="q" type="search" placeholder="Busca un producto, tienda o código" defaultValue={q} key={q} autoComplete="off" />
        </form>
        <div className="top-actions">
          <SeoToggle />
          <Link className="btn btn-primary" href="/compartir">Compartir chollo</Link>
          {reader === null && <Link className="btn" href="/entrar">Entrar</Link>}
          {reader && (
            <form className="who" action={signOutReader}>
              {reader.handle && <span className="handle">@{reader.handle}</span>}
              <button className="btn" type="submit">Salir</button>
            </form>
          )}
        </div>
      </div>
      <nav className="cats" aria-label="Categorías">
        <div className="wrap">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} aria-current={path === "/" && cat === s.slug ? "page" : undefined}>
              {s.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}

function Live({ reader }: { reader: HeaderReader }) {
  const path = usePathname();
  const sp = useSearchParams();
  const cat = sp.get("cat") ?? "";
  // an unknown ?cat= shows everything, so "Todos" is the current tab
  return <Shell path={path} cat={CATEGORIES.some((c) => c.slug === cat) ? cat : ""} q={sp.get("q") ?? ""} reader={reader} />;
}

export function SiteHeader({ live = false, reader }: { live?: boolean; reader?: HeaderReader }) {
  return live ? <Live reader={reader ?? null} /> : <Shell path="" cat="" q="" />;
}
