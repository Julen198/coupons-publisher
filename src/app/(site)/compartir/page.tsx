import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { siteStoreOptions } from "@/lib/public-site";
import { getReader } from "@/lib/reader";
import { ShareForm } from "./share-form";

export const metadata: Metadata = { title: "Compartir un chollo", robots: { index: false } };

export default async function CompartirPage() {
  const reader = await getReader();
  if (!reader?.handle) redirect("/entrar?next=/compartir");
  const stores = await siteStoreOptions();
  return (
    <main className="wrap">
      <div className="panel share-card">
        <h1>Compartir un chollo</h1>
        <p className="small">Lo revisamos antes de publicarlo. Solo enlaces https a la tienda.</p>
        <ShareForm stores={stores} />
      </div>
    </main>
  );
}
