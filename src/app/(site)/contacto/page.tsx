import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { contactEmail, partnersEmail, privacyEmail } from "@/lib/site-text";
import { InfoPage } from "../info-page";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Escribe al equipo de CuponLab.",
  alternates: { canonical: "/contacto" },
};

export default async function ContactPage() {
  await connection(); // the address is read per request
  const email = contactEmail();
  if (!email) notFound();
  const partners = partnersEmail();
  const privacy = privacyEmail();
  const mail = (a: string) => <a href={`mailto:${a}`}>{a}</a>;
  return (
    <InfoPage name="Contacto" title="Contacto">
      <p>Escríbenos a {mail(email)}.</p>
      {(partners !== email || privacy !== email) && (
        <ul>
          {partners !== email && <li>Tiendas, redes de afiliación y medios: {mail(partners)}</li>}
          {privacy !== email && <li>Privacidad y tus datos: {mail(privacy)}</li>}
        </ul>
      )}
    </InfoPage>
  );
}
