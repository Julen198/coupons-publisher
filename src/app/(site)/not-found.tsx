import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="wrap">
      <section className="intro">
        <h1>Esta página no existe</h1>
        <p className="answer">
          Puede que el chollo haya caducado y lo hayamos retirado, o que el enlace esté mal escrito. Mira los <Link href="/">chollos de hoy</Link> o
          busca la tienda en <Link href="/tiendas">todas las tiendas</Link>.
        </p>
      </section>
    </main>
  );
}
