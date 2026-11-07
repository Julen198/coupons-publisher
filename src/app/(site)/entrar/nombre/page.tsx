import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getReader } from "@/lib/reader";
import { safeNext } from "@/lib/session";
import { NombreForm } from "./nombre-form";

export const metadata: Metadata = { title: "Elige tu nombre público", robots: { index: false } };

export default async function NombrePage({ searchParams }: PageProps<"/entrar/nombre">) {
  const reader = await getReader();
  if (!reader) redirect("/entrar");
  const { next } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : null, "/");
  if (reader.handle) redirect(target);
  return (
    <main className="wrap entry-page">
      <section className="entry-card" aria-labelledby="nombre-h">
        <div className="entry-head">
          <span className="entry-kicker">Último paso</span>
          <h1 id="nombre-h">Elige tu nombre público</h1>
        </div>
        <NombreForm next={target} />
      </section>
    </main>
  );
}
