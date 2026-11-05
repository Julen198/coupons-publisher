"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LOGO = (
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#1d4ed8" />
    <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="translate(4 4)">
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M10 9l4 6" />
    </g>
  </svg>
);

const SECTIONS = [
  { href: "/", label: "Todos", match: (p: string, tipo: string) => p === "/" && !tipo },
  { href: "/?tipo=codigos", label: "Con código", match: (p: string, tipo: string) => p === "/" && tipo === "codigos" },
  { href: "/?tipo=ofertas", label: "Sin código", match: (p: string, tipo: string) => p === "/" && tipo === "ofertas" },
  { href: "/tiendas", label: "Tiendas", match: (p: string) => p.startsWith("/tiendas") },
  { href: "/calendario", label: "Calendario", match: (p: string) => p === "/calendario" },
];

function Shell({ path, tipo, q }: { path: string; tipo: string; q: string }) {
  return (
    <header className="top">
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
          <input id="q" name="q" type="search" placeholder="Busca una tienda, un producto o un código" defaultValue={q} key={q} autoComplete="off" />
        </form>
      </div>
      <nav className="cats" aria-label="Secciones">
        <div className="wrap">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} aria-current={s.match(path, tipo) ? "page" : undefined}>
              {s.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}

function Live() {
  const path = usePathname();
  const sp = useSearchParams();
  return <Shell path={path} tipo={sp.get("tipo") ?? ""} q={sp.get("q") ?? ""} />;
}

export function SiteHeader({ live = false }: { live?: boolean }) {
  return live ? <Live /> : <Shell path="" tipo="" q="" />;
}
