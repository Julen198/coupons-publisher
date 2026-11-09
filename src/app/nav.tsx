"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MAIN = [
  { href: "/panel", label: "Resumen" },
  { href: "/panel/estadisticas", label: "Estadísticas" },
  { href: "/panel/clients", label: "Clientes" },
  { href: "/panel/stores", label: "Tiendas" },
  { href: "/panel/coupons", label: "Cupones" },
  { href: "/panel/moderacion", label: "Revisión" },
  { href: "/panel/guias", label: "Guías SEO" },
  { href: "/panel/pages", label: "Páginas" },
];
const SECONDARY = [
  { href: "/panel/networks", label: "Redes de afiliación" },
];
const ADMIN = [
  { href: "/panel/costs", label: "Costes de IA" },
];

export function Nav({ admin = false }: { admin?: boolean }) {
  return <NavList path={usePathname()} admin={admin} />;
}

function NavLink({ href, label, path }: { href: string; label: string; path: string }) {
  const active = href === "/panel" ? path === "/panel" : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center rounded-lg px-3 text-sm ${
        active
          ? "bg-indigo-100 font-semibold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
          : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      }`}
    >
      {label}
    </Link>
  );
}

// Also rendered without a path as the Suspense fallback while the pathname streams in
export function NavList({ path = "", admin = false }: { path?: string; admin?: boolean }) {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {MAIN.map((i) => <NavLink key={i.href} {...i} path={path} />)}
      <div className="mx-3 my-3 h-px bg-neutral-200 dark:bg-neutral-800" />
      {SECONDARY.map((i) => <NavLink key={i.href} {...i} path={path} />)}
      {admin && ADMIN.map((i) => <NavLink key={i.href} {...i} path={path} />)}
    </nav>
  );
}
