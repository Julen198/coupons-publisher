// The big badge on each coupon ("15%", "10€", "2×1"). Free text from the web ("2,5 € de dto", "Precio rebajado")
// becomes the clear figure inside it, or "" so the page shows "Oferta" instead of a word cut in half.
const SHORT_WORDS = /^(env[ií]o gratis|gratis|regalo|\d+ (mes|meses|d[ií]as?) gratis)$/i;

export function discountBadge(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return "";
  if (s.length <= 12 && SHORT_WORDS.test(s)) return s;
  const pay = s.match(/lleva (\d+) y paga (\d+)/i);
  if (pay) return `${pay[1]}x${pay[2]}`;
  const nxm = s.match(/\b(\d)\s?[x×]\s?(\d)\b/);
  if (nxm) return nxm[0].replace(/\s/g, "");
  const figure = s.match(/-?\d+(?:[.,]\d+)?\s?(?:%|€)/);
  if (!figure) return "";
  const upTo = /^hasta\b/i.test(s) ? "Hasta " : "";
  return `${upTo}${figure[0]}`;
}
