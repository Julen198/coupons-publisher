import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { contactEmail } from "@/lib/site-text";
import { InfoPage } from "../info-page";

export const metadata: Metadata = {
  title: "Privacidad del conector de CuponLab para asistentes de IA",
  description: "Qué datos trata el servidor MCP de CuponLab cuando lo usas desde Claude, ChatGPT u otro asistente de IA.",
  alternates: { canonical: "/privacidad-asistentes" },
};

// The privacy policy the Claude and ChatGPT directories ask for: what the MCP server (src/app/mcp/route.ts) and the
// /go links it hands out actually keep. Keep it in step with clicks.ts and click-signals.ts.
export default async function AssistantsPrivacyPage() {
  await connection(); // the address is read per request
  const email = contactEmail();
  return (
    <InfoPage name="Privacidad para asistentes" title="Privacidad del conector para asistentes de IA">
      <p>Esta política cubre el servidor MCP de CuponLab (<Link href="/asistentes-ia">cómo funciona</Link>), el que usan Claude, ChatGPT y otros asistentes para buscar cupones.</p>
      <h2>Qué recibe el servidor</h2>
      <p>Solo lo que el asistente envía para buscar: el texto de la búsqueda, la tienda o la categoría. No pide ni recibe tu nombre, tu correo, tu cuenta ni tu conversación.</p>
      <h2>Qué guardamos</h2>
      <ul>
        <li>Las búsquedas no se guardan en ninguna base de datos. Los registros técnicos del servidor pueden conservar un error durante unos días para arreglarlo.</li>
        <li>No usamos cuentas, contraseñas ni cookies en el servidor MCP.</li>
        <li>Si abres un enlace a una tienda, contamos el clic igual que en la web: qué cupón, cuándo, desde qué asistente (Claude, ChatGPT u otro) y un resumen cifrado del navegador que cambia cada día. No guardamos tu IP en nuestra base de datos. Los clics se borran a los 400 días como mucho.</li>
      </ul>
      <h2>Con quién se comparte</h2>
      <p>
        Al llegar a la tienda, la red de afiliación sabe que vienes de CuponLab, para pagarnos la comisión si compras (<Link href="/aviso-de-afiliacion">aviso de afiliación</Link>).
        No vendemos ni compartimos datos con nadie más.
      </p>
      <h2>Contacto</h2>
      <p>
        Para cualquier duda sobre tus datos, escríbenos{" "}
        {email ? <>a <a href={`mailto:${email}`}>{email}</a></> : <>desde <Link href="/contacto">contacto</Link></>}.
      </p>
    </InfoPage>
  );
}
