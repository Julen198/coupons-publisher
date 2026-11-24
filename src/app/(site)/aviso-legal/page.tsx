import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { COMPANY, contactEmail } from "@/lib/site-text";
import { InfoPage } from "../info-page";

export const metadata: Metadata = {
  title: "Aviso legal",
  description: "Quién está detrás de CuponLab: razón social, domicilio, CIF y contacto.",
  alternates: { canonical: "/aviso-legal" },
};

// The identification the LSSI (art. 10) asks of any Spanish website; the company data lives in COMPANY (site-text.ts)
export default async function LegalNoticePage() {
  await connection(); // the contact address is read per request
  const email = contactEmail();
  return (
    <InfoPage name="Aviso legal" title="Aviso legal">
      <p>CuponLab (cuponlab.com) es un sitio web de:</p>
      <ul>
        <li>Razón social: {COMPANY.name}</li>
        <li>CIF: {COMPANY.cif}</li>
        <li>Domicilio: {COMPANY.address}</li>
        {email && (
          <li>
            Contacto: <a href={`mailto:${email}`}>{email}</a>
          </li>
        )}
      </ul>
      <p>
        CuponLab recopila códigos descuento y ofertas de tiendas online. Algunos enlaces son de afiliado (<Link href="/aviso-de-afiliacion">aviso de afiliación</Link>); las condiciones de cada
        oferta las fija la tienda.
      </p>
    </InfoPage>
  );
}
