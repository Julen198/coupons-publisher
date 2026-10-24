// FormData validators for server actions. They throw Error with a user-facing Spanish message.

export type FormState = { error?: string };

export const str = (f: FormData, key: string) => String(f.get(key) ?? "").trim();

export function required(f: FormData, key: string, label = key) {
  const v = str(f, key);
  if (!v) throw new Error(`Falta ${label}`);
  return v;
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function slug(f: FormData, key = "slug") {
  const v = required(f, key, "el slug").toLowerCase();
  if (!/^[a-z0-9-]+$/.test(v)) throw new Error("Slug: solo minúsculas, números y guiones");
  return v;
}

// Only http(s): these end up in hrefs on clients' sites
export function url(f: FormData, key: string, label = key) {
  const v = required(f, key, label);
  const u = URL.canParse(v) ? new URL(v) : null;
  if (!u || !["http:", "https:"].includes(u.protocol)) throw new Error(`${label} debe ser una URL http(s)`);
  return v;
}

export function digits(f: FormData, key: string, label = key) {
  const v = str(f, key);
  if (v && !/^\d+$/.test(v)) throw new Error(`${label} solo lleva números`);
  return v;
}

export function hexColor(f: FormData, key: string) {
  const v = str(f, key) || "#1d4ed8";
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error("Color inválido");
  return v.toLowerCase();
}

export function isoDate(f: FormData, key: string) {
  const v = str(f, key);
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("Fecha inválida");
  return v;
}

export const bareDomain = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

export const errorMessage = (e: unknown) => {
  if (!(e instanceof Error)) return "Error inesperado";
  // postgres unique_violation
  if ((e as { code?: string }).code === "23505") return "Ya existe uno con ese nombre";
  return e.message;
};

export const ids = (f: FormData) => f.getAll("ids").map(Number).filter((n) => Number.isInteger(n) && n > 0);
