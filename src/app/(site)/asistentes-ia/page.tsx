import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { contactEmail, siteUrl } from "@/lib/site-text";
import { InfoPage } from "../info-page";

export const metadata: Metadata = {
  title: "CuponLab en Claude, ChatGPT y otros asistentes de IA",
  description: "Conecta CuponLab a tu asistente de IA para que encuentre los códigos descuento y chollos activos de tiendas online en España.",
  alternates: { canonical: "/asistentes-ia" },
};

// Documentation of the MCP server (src/lib/mcp.ts): the page the Claude and ChatGPT directories link to
export default async function AssistantsPage() {
  await connection(); // the server's address comes from SITE_URL, read per request
  const url = `${siteUrl()}/mcp`;
  const email = contactEmail();
  return (
    <InfoPage name="Asistentes de IA" title="CuponLab en tu asistente de IA">
      <p>CuponLab tiene un servidor MCP. Con él, Claude, ChatGPT y otros asistentes encuentran los códigos descuento y chollos activos de tiendas online en España mientras te ayudan a comprar.</p>
      <h2>Cómo conectarlo</h2>
      <p>Dirección del servidor: <code>{url}</code>. No hace falta cuenta ni contraseña.</p>
      <ul>
        <li><strong>Claude:</strong> Ajustes → Conectores → Añadir conector personalizado, y pega la dirección.</li>
        <li><strong>ChatGPT:</strong> Ajustes → Apps y conectores, y añade CuponLab (o créalo con la dirección en el modo desarrollador).</li>
        <li><strong>Otros asistentes:</strong> cualquier cliente MCP con transporte Streamable HTTP.</li>
      </ul>
      <h2>Qué puede hacer</h2>
      <ul>
        <li><strong>search_coupons:</strong> busca cupones por producto, marca, tienda o categoría.</li>
        <li><strong>top_deals:</strong> los mejores chollos de hoy, por votos de la comunidad y comprobaciones.</li>
        <li><strong>get_coupon:</strong> el detalle de un cupón: condiciones, caducidad y si lo ha comprobado una persona.</li>
        <li><strong>list_stores:</strong> las tiendas con cupones activos.</li>
      </ul>
      <p>Todas las herramientas solo leen. Devuelven los mismos cupones que ves en CuponLab y nunca compran, escriben ni cambian nada.</p>
      <h2>Ejemplos</h2>
      <ul>
        <li>«Voy a comprar unas zapatillas Nike, ¿hay algún código descuento?»</li>
        <li>«¿Qué chollos de tecnología hay hoy para el Black Friday?»</li>
        <li>«¿Tiene CuponLab cupones de El Corte Inglés?»</li>
      </ul>
      <h2>Enlaces y privacidad</h2>
      <p>
        Los enlaces a las tiendas son de afiliado: la tienda puede pagarnos una comisión y tu precio no cambia (<Link href="/aviso-de-afiliacion">aviso de afiliación</Link>).
        Qué datos se tratan está en la <Link href="/privacidad-asistentes">política de privacidad para asistentes</Link>.
      </p>
      <p>
        ¿Dudas o un problema? Escríbenos{" "}
        {email ? <>a <a href={`mailto:${email}`}>{email}</a></> : <>desde <Link href="/contacto">contacto</Link></>}.
      </p>
    </InfoPage>
  );
}
