import type { Metadata } from "next";
import { EntrarForm } from "./entrar-form";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const { next } = await searchParams;
  return (
    <main className="wrap">
      <div className="panel auth-card">
        <h1>Entra en CuponLab</h1>
        <p className="small">No hace falta contraseña. Te mandamos un enlace al email.</p>
        <EntrarForm next={typeof next === "string" ? next : "/"} />
      </div>
    </main>
  );
}
