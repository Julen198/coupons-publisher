// Turns parsed CSV rows into coupon inserts. Header names are matched loosely (accents/case ignored),
// the store by slug or name. Every rejected line says why, so the admin can fix the file.

export const IMPORT_COLUMNS = ["tienda", "titulo", "codigo", "descuento", "descripcion", "url", "caduca", "verificado"] as const;

export interface ImportStore { id: number; name: string; slug: string; website: string }
export interface CouponInsert {
  store_id: number; kind: "code" | "deal"; title: string; code: string; discount: string;
  description: string; target_url: string; expires_at: string; verified: number;
}

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const YES = new Set(["si", "sí", "yes", "true", "1", "x"]);

// Accepts YYYY-MM-DD or DD/MM/YYYY
function toIsoDate(v: string): string | null {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

export function mapCouponRows(rows: string[][], stores: ImportStore[]) {
  const [header = [], ...data] = rows;
  const col = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, header.findIndex((h) => norm(h) === c)]));
  if (col.tienda < 0 || col.titulo < 0) {
    return { inserts: [] as CouponInsert[], errors: ["La cabecera debe tener al menos las columnas «tienda» y «titulo»."] };
  }
  const byKey = new Map(stores.flatMap((s) => [[norm(s.slug), s], [norm(s.name), s]] as const));
  const get = (r: string[], c: (typeof IMPORT_COLUMNS)[number]) => (col[c] >= 0 ? (r[col[c]] ?? "").trim() : "");

  const inserts: CouponInsert[] = [];
  const errors: string[] = [];
  data.forEach((r, i) => {
    const line = i + 2; // 1-based, after the header
    const store = byKey.get(norm(get(r, "tienda")));
    const title = get(r, "titulo");
    const url = get(r, "url") || store?.website || "";
    const expires = toIsoDate(get(r, "caduca"));
    if (!store) return errors.push(`Línea ${line}: la tienda «${get(r, "tienda")}» no existe`);
    if (!title) return errors.push(`Línea ${line}: falta el título`);
    if (!/^https?:\/\//.test(url)) return errors.push(`Línea ${line}: la URL debe empezar por http(s)://`);
    if (expires === null) return errors.push(`Línea ${line}: fecha «${get(r, "caduca")}» no válida (usa AAAA-MM-DD o DD/MM/AAAA)`);
    const code = get(r, "codigo").toUpperCase();
    inserts.push({
      store_id: store.id, kind: code ? "code" : "deal", title, code, discount: get(r, "descuento"),
      description: get(r, "descripcion"), target_url: url, expires_at: expires, verified: YES.has(norm(get(r, "verificado"))) ? 1 : 0,
    });
  });
  return { inserts, errors };
}
