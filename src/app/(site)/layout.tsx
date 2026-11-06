import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { contactEmail, madridToday, siteUrl } from "@/lib/site-text";
import { LiveHeader } from "./live-header";
import { SeoDrawer } from "./seo-panel";
import { SiteHeader } from "./site-header";
import { Toaster } from "./toast";
import "./site.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["500", "700"] });

// The public deals site: indexable (the root layout keeps the panel out of search engines)
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "CuponLab: chollos y códigos descuento verificados", template: "%s | CuponLab" },
  description: "Chollos y códigos descuento de tiendas españolas, cada uno con su fecha de caducidad y si está comprobado.",
  robots: { index: true, follow: true },
  openGraph: { siteName: "CuponLab", locale: "es_ES", type: "website" },
};

// The year in the footer, worked out once a day so the shell stays prerendered
async function FooterYear() {
  "use cache";
  cacheLife("days");
  return madridToday().iso.slice(0, 4);
}

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`cl ${archivo.variable} ${jetbrains.variable}`}>
      {/* the header reads the search box and the active section from the URL */}
      <Suspense fallback={<SiteHeader />}>
        <LiveHeader />
      </Suspense>
      {/* development only: decided on the server, so production ships neither the markup nor the drawer code */}
      {process.env.NODE_ENV !== "production" && (
        <Suspense fallback={null}>
          <SeoDrawer />
        </Suspense>
      )}
      {/* every page reads the database at request time */}
      <div id="contenido">
        <Suspense fallback={<div className="wrap loading"><p className="crumbs">Cargando chollos…</p></div>}>{children}</Suspense>
      </div>
      <footer className="foot">
        <div className="wrap">
          <span>© <FooterYear /> CuponLab · Chollos y códigos descuento verificados</span>
          <span>
            <Link href="/tiendas">Tiendas</Link> · <Link href="/calendario">Calendario de ofertas</Link> · <Link href="/metodologia">Metodología</Link> ·{" "}
            <Link href="/aviso-de-afiliacion">Aviso de afiliación</Link>
            {contactEmail() && (
              <>
                {" "}· <Link href="/contacto">Contacto</Link>
              </>
            )}
          </span>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}
