import type { Metadata } from "next";
import Link from "next/link";
import { confirmReaderLink } from "../../actions-reader";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

// The emailed link lands here; signing in needs the button press (a POST), so link prefetchers can't burn the token
export default async function ConfirmarPage({ searchParams }: PageProps<"/entrar/confirmar">) {
  const { token, next, invalid } = await searchParams;
  return (
    <main className="wrap">
      <div className="panel auth-card">
        <h1>Entra en CuponLab</h1>
        {invalid ? (
          <>
            <p>Este enlace ya no sirve. Pide otro.</p>
            <Link href="/entrar" className="btn btn-primary">Pedir otro enlace</Link>
          </>
        ) : (
          <>
            <p className="small">Pulsa el botón para terminar de entrar.</p>
            <form action={confirmReaderLink} className="auth-form">
              <input type="hidden" name="token" value={typeof token === "string" ? token : ""} />
              <input type="hidden" name="next" value={typeof next === "string" ? next : "/"} />
              <button className="btn btn-primary">Entrar en CuponLab</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
