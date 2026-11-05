import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getReader } from "@/lib/reader";
import { safeNext } from "@/lib/session";
import { NombreForm } from "./nombre-form";

export const metadata: Metadata = { title: "Elige tu nombre", robots: { index: false } };

export default async function NombrePage({ searchParams }: PageProps<"/entrar/nombre">) {
  const reader = await getReader();
  if (!reader) redirect("/entrar");
  const { next } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : null, "/");
  if (reader.handle) redirect(target);
  return (
    <main className="wrap">
      <div className="panel auth-card">
        <h1>Elige tu nombre</h1>
        <p className="small">Es lo que verán los demás junto a tus comentarios y votos.</p>
        <NombreForm next={target} />
      </div>
    </main>
  );
}
