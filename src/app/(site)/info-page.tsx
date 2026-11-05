import type { ReactNode } from "react";
import { siteUrl } from "@/lib/site-text";
import { Crumbs, JsonLd, crumbsLd } from "./site-ui";

// Layout shared by the plain text pages (methodology, affiliate notice, contact)
export function InfoPage({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  const crumbs = [{ name: "Inicio", href: "/" }, { name }];
  return (
    <main className="wrap">
      <JsonLd data={crumbsLd(siteUrl(), crumbs)} />
      <Crumbs items={crumbs} />
      <section className="info">
        <div className="section-head">
          <h1>{title}</h1>
        </div>
        <div className="prose">{children}</div>
      </section>
    </main>
  );
}
