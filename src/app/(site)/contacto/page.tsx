import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { contactEmail } from "@/lib/site-text";
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
  return (
    <InfoPage name="Contacto" title="Contacto">
      <p>
        Escríbenos a <a href={`mailto:${email}`}>{email}</a>.
      </p>
    </InfoPage>
  );
}
