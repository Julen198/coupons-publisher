import { today } from "./coupon-status.ts";

// Stand-in for Awin's promotions feed while the demo has no publisher API token.
// ponytail: static catalogue keyed by merchant id; swap fetchOffers() for the real Awin Offers API call when there's a token
export interface AwinOffer {
  id: string; // stable, stored in coupons.awin_offer_id to avoid double imports
  merchantId: string;
  kind: "code" | "deal";
  title: string;
  code: string;
  discount: string;
  description: string;
  url: string;
  expires: string; // YYYY-MM-DD or ""
}

type Raw = Omit<AwinOffer, "merchantId" | "expires"> & { days?: number };

const CATALOGUE: Record<string, Raw[]> = {
  "77008": [
    { id: "awin-77008-1", kind: "code", title: "Cupón adidas estudiantes", code: "STUDENT15", discount: "15%", description: "Verifica tu condición de estudiante.", url: "https://www.adidas.es/estudiantes" },
    { id: "awin-77008-2", kind: "deal", title: "Black Friday adidas: hasta -40%", code: "", discount: "40%", description: "Selección de calzado y textil.", url: "https://www.adidas.es/black_friday", days: 35 },
    { id: "awin-77008-3", kind: "code", title: "Envío gratis sin pedido mínimo", code: "FREESHIP", discount: "Envío", description: "Solo miembros adiClub.", url: "https://www.adidas.es/adiclub", days: 12 },
  ],
  "10001": [
    { id: "awin-10001-1", kind: "code", title: "Código Decathlon de 10€", code: "DECA10", discount: "10€", description: "Pedido mínimo 60€.", url: "https://www.decathlon.es", days: 3 },
    { id: "awin-10001-2", kind: "deal", title: "Running: hasta -30% en zapatillas", code: "", discount: "30%", description: "Modelos de temporada anterior.", url: "https://www.decathlon.es/es/running", days: 20 },
  ],
  "10002": [
    { id: "awin-10002-1", kind: "deal", title: "DAZN anual: 2 meses gratis", code: "", discount: "2 meses", description: "Pagando el plan anual por adelantado.", url: "https://www.dazn.com/es-ES", days: 40 },
  ],
  "10003": [
    { id: "awin-10003-1", kind: "deal", title: "Movistar Plus+ Fútbol a mitad de precio", code: "", discount: "50%", description: "Primeros 3 meses para nuevos clientes.", url: "https://www.movistarplus.es", days: 9 },
  ],
  "10004": [
    { id: "awin-10004-1", kind: "code", title: "Cupón Shein app 20%", code: "APPSHEIN20", discount: "20%", description: "Primer pedido desde la app.", url: "https://es.shein.com", days: 14 },
    { id: "awin-10004-2", kind: "deal", title: "Rebajas de otoño hasta -60%", code: "", discount: "60%", description: "Ropa y accesorios.", url: "https://es.shein.com/sale", days: 7 },
  ],
  "10005": [
    { id: "awin-10005-1", kind: "deal", title: "Ventas privadas", code: "", discount: "75%", description: "Registro gratuito.", url: "https://www.zalando-prive.es" },
    { id: "awin-10005-2", kind: "code", title: "10€ en tu primera compra", code: "PRIVE10", discount: "10€", description: "Pedido mínimo 50€.", url: "https://www.zalando-prive.es", days: 30 },
  ],
};

function addDays(base: string, days: number) {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  return today(d);
}

export function fetchOffers(merchantId: string, now = new Date()): AwinOffer[] {
  const base = today(now);
  return (CATALOGUE[merchantId] ?? []).map(({ days, ...o }) => ({
    ...o,
    merchantId,
    expires: days === undefined ? "" : addDays(base, days),
  }));
}
