import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SHARING_ENABLED } from "@/lib/community-rules";
import { redirect } from "next/navigation";
import { siteStoreOptions } from "@/lib/public-site";
import { getReader } from "@/lib/reader";
import { ShareForm } from "./share-form";

export const metadata: Metadata = { title: "Comparte un chollo", robots: { index: false } };

export default async function CompartirPage() {
  if (!SHARING_ENABLED) notFound(); // sharing is off for now (community-rules.ts)
  const reader = await getReader();
  if (!reader) redirect("/entrar?next=/compartir");
  if (!reader.handle) redirect("/entrar/nombre?next=/compartir");
  const stores = await siteStoreOptions();
  return (
    <main className="wrap">
      <div className="panel share-card">
        <h1>Comparte un chollo</h1>
        <p className="lead">Lo revisamos y, si cumple las normas, lo publicamos en unas horas con tu nombre.</p>
        <ShareForm stores={stores} />
      </div>
    </main>
  );
}
