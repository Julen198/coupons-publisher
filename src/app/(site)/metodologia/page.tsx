import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "../info-page";

export const metadata: Metadata = {
  title: "Cómo elegimos y comprobamos los cupones",
  description: "De dónde salen los cupones de CuponLab, quién los revisa, cuándo los retiramos y cómo ordenamos los chollos.",
  alternates: { canonical: "/metodologia" },
};

export default function MethodologyPage() {
  return (
    <InfoPage name="Metodología" title="Cómo elegimos y comprobamos los cupones">
      <h2>De dónde salen los cupones</h2>
      <p>
        La mayoría llegan de redes de afiliación como Awin, CJ, Rakuten, Impact, Tradedoubler, Admitad, Webgains o Effiliation. Los publicamos con las condiciones oficiales que fija cada tienda.
      </p>
      <h2>Los que encontramos en la web</h2>
      <p>
        Algunos cupones los buscamos nosotros en la web. Esos no se publican hasta que una persona del equipo los comprueba.
      </p>
      <h2>Qué significa «Comprobado»</h2>
      <p>
        Que alguien del equipo de CuponLab ha revisado ese cupón. Si no lleva la etiqueta, viene de la red de afiliación de la tienda con sus condiciones oficiales.
      </p>
      <h2>Cuándo retiramos un cupón</h2>
      <p>
        El día después de su fecha de caducidad desaparece de la portada y su página pasa a mostrar «Caducado».
      </p>
      <h2>Votos y comentarios</h2>
      <p>
        Los lectores votan y comentan. Los votos ordenan «Más votados». El equipo lee los comentarios y retira los que avisan de un cupón que ya no funciona.
      </p>
      <h2>Chollos compartidos por lectores</h2>
      <p>
        Los chollos que comparten los lectores solo se publican después de que un editor los revise.
      </p>
      <h2>Comisiones y orden</h2>
      <p>
        Las comisiones de afiliación no cambian qué cupones mostramos ni en qué orden. Más detalles en el <Link href="/aviso-de-afiliacion">aviso de afiliación</Link>.
      </p>
    </InfoPage>
  );
}
