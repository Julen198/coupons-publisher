import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/site-text";
import { InfoPage } from "../info-page";

export const metadata: Metadata = {
  title: "Condiciones de uso",
  description: "Las condiciones para usar CuponLab, su web y su conector para asistentes de IA.",
  alternates: { canonical: "/condiciones-de-uso" },
};

// The terms of service the ChatGPT plugin directory asks for (termsOfServiceURL); they cover the site and the MCP server
export default function TermsPage() {
  return (
    <InfoPage name="Condiciones de uso" title="Condiciones de uso">
      <p>
        Estas condiciones se aplican a la web cuponlab.com y a su conector para asistentes de IA (<Link href="/asistentes-ia">servidor MCP</Link>). Las ofrece {COMPANY.name} (
        <Link href="/aviso-legal">aviso legal</Link>). Usar CuponLab supone aceptarlas.
      </p>
      <h2>Qué es CuponLab</h2>
      <p>CuponLab reúne códigos descuento y ofertas de tiendas online en España. Es gratis y, para consultar cupones, no hace falta cuenta.</p>
      <h2>Los cupones y las ofertas</h2>
      <ul>
        <li>Cada tienda fija las condiciones de sus ofertas: importe mínimo, productos incluidos, fechas, unidades disponibles…</li>
        <li>Comprobamos los cupones antes de publicarlos (<Link href="/metodologia">metodología</Link>), pero una tienda puede cambiar o retirar una oferta en cualquier momento. No podemos garantizar que un código funcione en tu compra.</li>
        <li>La compra la haces con la tienda, no con CuponLab. Pagos, envíos, devoluciones y garantías son cosa de la tienda.</li>
      </ul>
      <h2>Enlaces de afiliado</h2>
      <p>
        Algunos enlaces son de afiliado: si compras, la tienda puede pagarnos una comisión. Tu precio no cambia y las comisiones no deciden qué cupones mostramos ni en qué orden (
        <Link href="/aviso-de-afiliacion">aviso de afiliación</Link>).
      </p>
      <h2>Asistentes de IA</h2>
      <p>
        Si usas CuponLab desde Claude, ChatGPT u otro asistente, el asistente es quien redacta la respuesta. Los datos de cada cupón (código, descuento, caducidad y enlace) son los mismos que en la web. Ante cualquier duda, manda lo que diga la ficha del cupón en cuponlab.com.
      </p>
      <h2>Uso aceptable</h2>
      <p>No uses CuponLab para copiar su contenido de forma masiva, sobrecargar el servicio ni publicar contenido falso, ilegal u ofensivo en comentarios o chollos compartidos. Podemos retirar contenido y bloquear cuentas que no respeten estas normas.</p>
      <h2>Responsabilidad</h2>
      <p>CuponLab se ofrece tal cual. En lo que permita la ley, no respondemos de las ofertas de terceros ni de los daños por usar un cupón o una tienda.</p>
      <h2>Privacidad</h2>
      <p>
        Qué datos tratamos al usar el conector está en la <Link href="/privacidad-asistentes">política de privacidad para asistentes</Link>.
      </p>
      <h2>Cambios y ley aplicable</h2>
      <p>
        Podemos actualizar estas condiciones. La versión vigente es la publicada en esta página. Se rigen por la ley española. Para cualquier duda, <Link href="/contacto">escríbenos</Link>.
      </p>
    </InfoPage>
  );
}
