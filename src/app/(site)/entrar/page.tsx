import type { Metadata } from "next";
import { EntrarForm } from "./entrar-form";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const { next } = await searchParams;
  return (
    <main className="wrap">
      <div className="panel auth-card">
        <h1>Entra en CuponLab</h1>
        <p className="lead">No hace falta contraseña. Te mandamos un enlace al email.</p>
        <EntrarForm next={typeof next === "string" ? next : "/"} />
        <p className="small">
          Al entrar puedes votar, comentar, guardar chollos y compartir los tuyos. Con tu cuenta eliges un nombre público como <span className="mono">@tu_nombre</span>.
        </p>
      </div>
    </main>
  );
}
