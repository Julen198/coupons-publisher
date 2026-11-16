import { shareCard, SHARE_SIZE } from "./share-card";

// The home page's picture when shared, and the one every site page without its own inherits
export const alt = "Chollos y códigos descuento en CuponLab";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default function Image() {
  return shareCard("Chollos y códigos descuento", "De tiendas españolas, comprobados a diario");
}
