import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "../info-page";

export const metadata: Metadata = {
  title: "Aviso de afiliación",
  description: "Cómo gana dinero CuponLab con los enlaces de afiliado y por qué no afecta a tu precio ni a los cupones que mostramos.",
  alternates: { canonical: "/aviso-de-afiliacion" },
};

export default function AffiliateNoticePage() {
  return (
    <InfoPage name="Aviso de afiliación" title="Aviso de afiliación">
      <p>Algunos enlaces de CuponLab son de afiliado. Si compras a través de ellos, la tienda paga una comisión a CuponLab.</p>
      <p>Tu precio no cambia.</p>
      <p>Las comisiones no cambian qué cupones mostramos ni en qué orden aparecen.</p>
      <p>Los enlaces pasan por una dirección nuestra (/go) para que podamos contar los clics.</p>
      <p>
        Cómo elegimos y comprobamos los cupones está en la <Link href="/metodologia">metodología</Link>.
      </p>
    </InfoPage>
  );
}
