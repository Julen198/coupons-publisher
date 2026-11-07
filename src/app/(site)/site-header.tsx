"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/lib/catalog";
import { signOutReader } from "./actions-reader";
import { SeoToggle } from "./seo-panel";
import { AccountMenu } from "./account-menu";

// undefined = not known yet (the Suspense fallback); null = signed out
export type HeaderReader = { handle: string | null } | null;

const SHARE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
  </svg>
);

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

// The category of the page being shown (a store's), so the header can mark it; set by <MarkHeaderCategory> on that page
const PageCategory = createContext<{ cat: string; setCat: (slug: string) => void }>({ cat: "", setCat: () => {} });

export function HeaderCategoryProvider({ children }: { children: ReactNode }) {
  const [cat, setCat] = useState("");
  const value = useMemo(() => ({ cat, setCat }), [cat]);
  return <PageCategory.Provider value={value}>{children}</PageCategory.Provider>;
}

// Rendered by a store page: its category is the current one in the header until the reader leaves the page
export function MarkHeaderCategory({ slug }: { slug: string }) {
  const { setCat } = useContext(PageCategory);
  useEffect(() => {
    setCat(slug);
    return () => setCat("");
  }, [slug, setCat]);
  return null;
}

// Pages with a feed of deals (home, categories, search, a store) skip straight to it; the rest to their content
const hasFeed = (path: string) => path === "/" || path.startsWith("/tiendas/");

function Shell({ path, cat, q, reader, pageCat = "" }: { path: string; cat: string; q: string; reader?: HeaderReader; pageCat?: string }) {
  // the home page marks its ?cat=; a store page marks the store's category
  const current = (slug: string) => (path === "/" ? cat === slug : !!pageCat && path.startsWith("/tiendas/") && pageCat === slug);
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
          <input id="q" name="q" type="search" placeholder="Busca una tienda, un producto o un código" defaultValue={q} key={q} autoComplete="off" />
        </form>
        <div className="top-actions">
          <SeoToggle />
          {reader === null && <Link className="btn" href="/entrar">Entrar</Link>}
          {reader && (
            <form className="who" action={signOutReader}>
              {reader.handle && <Link className="handle" href="/cuenta">@{reader.handle}</Link>}
              <button className="btn" type="submit">Salir</button>
            </form>
          )}
          {/* phones: the share icon alone, and the account behind a round button (SiteHeaderMobile board) */}
          {/* signed out: straight to the sign-in modal over this page (going through /compartir would redirect, leaving the
              modal over an empty page); after signing in the reader lands on /compartir */}
          <Link className="btn btn-primary share" href={reader === null ? "/entrar?next=/compartir" : "/compartir"} aria-label="Compartir chollo">
            {SHARE_ICON}
            <span className="share-label">Compartir chollo</span>
          </Link>
          {reader && <AccountMenu handle={reader.handle} />}
        </div>
      </div>
      {/* compartir and cuenta have no category bar in the design; the entrar pages are modals over a page that has one */}
      {!/^\/(compartir|cuenta)(\/|$)/.test(path) && (
      <nav className="cats" aria-label="Categorías">
        <div className="wrap">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} aria-current={current(s.slug) ? "page" : undefined}>
              {s.label}
            </Link>
          ))}
        </div>
      </nav>
      )}
    </header>
  );
}

function Live({ reader }: { reader: HeaderReader }) {
  const path = usePathname();
  const sp = useSearchParams();
  const cat = sp.get("cat") ?? "";
  const { cat: pageCat } = useContext(PageCategory);
  // an unknown ?cat= shows everything, so "Todos" is the current tab
  return <Shell path={path} cat={CATEGORIES.some((c) => c.slug === cat) ? cat : ""} q={sp.get("q") ?? ""} reader={reader} pageCat={pageCat} />;
}

export function SiteHeader({ live = false, reader }: { live?: boolean; reader?: HeaderReader }) {
  return live ? <Live reader={reader ?? null} /> : <Shell path="" cat="" q="" />;
}
