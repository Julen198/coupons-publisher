import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { siteUrl } from "@/lib/site-text";
import { LiveHeader } from "./live-header";
import { SiteHeader } from "./site-header";
import "./site.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["500", "700"] });

// The public deals site: indexable (the root layout keeps the panel out of search engines)
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "CuponLab: chollos y códigos descuento verificados", template: "%s | CuponLab" },
  description: "Chollos y códigos descuento de tiendas españolas, cada uno con su fecha de caducidad y si lo ha comprobado una persona.",
  robots: { index: true, follow: true },
  openGraph: { siteName: "CuponLab", locale: "es_ES", type: "website" },
};

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`cl ${archivo.variable} ${jetbrains.variable}`}>
      {/* the header reads the search box and the active section from the URL */}
      <Suspense fallback={<SiteHeader />}>
        <LiveHeader />
      </Suspense>
      {/* every page reads the database at request time */}
      <Suspense fallback={<div className="wrap"><p className="crumbs">Cargando chollos…</p></div>}>{children}</Suspense>
      <footer className="foot">
        <div className="wrap">
          <span>© CuponLab · Chollos y códigos descuento verificados</span>
          <span>
            <Link href="/tiendas">Tiendas</Link> · <Link href="/calendario">Calendario de ofertas</Link> · Algunos enlaces son de afiliado
          </span>
        </div>
      </footer>
    </div>
  );
}
