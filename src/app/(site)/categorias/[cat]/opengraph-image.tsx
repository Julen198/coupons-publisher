import { categoryOf } from "@/lib/catalog";
import { shareCard, SHARE_SIZE } from "../../share-card";

// A category page's picture when shared
export const alt = "Chollos por categoría en CuponLab";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ cat: string }> }) {
  const cat = categoryOf((await params).cat);
  if (!cat) return new Response("Página no encontrada", { status: 404 });
  return shareCard(`Chollos de ${cat.label}`, "Cupones y ofertas de tiendas españolas");
}
