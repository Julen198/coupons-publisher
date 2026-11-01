import { slugify } from "./form.ts";

// Turns a pasted list (one store per line) into store inserts. Each line holds a name, a website and/or an
// Awin merchant ID in any order, separated by tab (Excel paste), ";" or ",". Every rejected line says why.
// ponytail: no quoting — a comma inside a store name needs ";" or tab as separator

export interface StoreInsert { name: string; slug: string; website: string; merchant_id: string }

export const MAX_STORE_LINES = 500;
const DOMAIN = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;
const HEADER = new Set(["nombre", "tienda", "name", "store", "web", "website"]);

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

// "www.zalando.es" → "Zalando"
const nameFromUrl = (url: string) => {
  const label = host(url).split(".")[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export function mapStoreLines(text: string): { stores: StoreInsert[]; errors: string[]; rejected: string[] } {
  const stores: StoreInsert[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).slice(0, MAX_STORE_LINES);
  lines.forEach((raw, i) => {
    const line = i + 1;
    const sep = raw.includes("\t") ? "\t" : raw.includes(";") ? ";" : ",";
    const cells = raw.split(sep).map((c) => c.trim()).filter(Boolean);
    if (!cells.length || HEADER.has(cells[0].toLowerCase())) return;
    const id = cells.find((c) => /^\d+$/.test(c)) ?? "";
    // "Booking.com, https://www.booking.com": the cell with a scheme/www is the site, the bare "x.com" is the name
    const site = cells.find((c) => DOMAIN.test(c) && /^(https?:\/\/|www\.)/i.test(c)) ?? cells.find((c) => DOMAIN.test(c));
    const name = cells.find((c) => c !== id && c !== site);
    if (!site) return errors.push(`Línea ${line}: falta la web (p. ej. ${slugify(name ?? "tienda").replace(/-/g, "")}.es)`);
    const website = /^https?:\/\//i.test(site) ? site : `https://${site}`;
    const store = { name: name ?? nameFromUrl(website), website, merchant_id: id };
    const slug = slugify(store.name);
    if (!slug) return errors.push(`Línea ${line}: el nombre necesita letras o números`);
    if (stores.some((s) => s.slug === slug || host(s.website) === host(website))) {
      return errors.push(`Línea ${line}: «${store.name}» repite una tienda de la lista`);
    }
    stores.push({ ...store, slug });
  });
  // the raw lines that failed, so the form can hand them back to fix
  const rejected = errors.map((e) => lines[Number(e.match(/^Línea (\d+)/)![1]) - 1]);
  return { stores, errors, rejected };
}
