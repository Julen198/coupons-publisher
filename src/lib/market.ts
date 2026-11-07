// The public site is Spanish: stores whose website lives in another European market (jdsports.it, bergfreunde.de…)
// stay out of it. Only the host's ending counts; "" (no website) stays in.
const OTHER_MARKETS = [".it", ".pt", ".fr", ".de", ".nl", ".be", ".at", ".ch", ".co.uk", ".uk", ".pl", ".se", ".dk", ".fi", ".ie"];

export function hostOf(website: string): string {
  return website
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

export function isSpanishMarket(website: string): boolean {
  const host = hostOf(website);
  return !OTHER_MARKETS.some((tld) => host.endsWith(tld));
}

// ---- a store's country (stores.country: ISO 3166-1 alpha-2 in upper case, "" = unknown)

// The countries an editor can pick in the panel: España first, then the rest by their Spanish name
const OTHER_COUNTRIES: readonly { code: string; label: string }[] = [
  { code: "DE", label: "Alemania" }, { code: "AT", label: "Austria" }, { code: "BE", label: "Bélgica" },
  { code: "DK", label: "Dinamarca" }, { code: "US", label: "Estados Unidos" }, { code: "FI", label: "Finlandia" },
  { code: "FR", label: "Francia" }, { code: "IE", label: "Irlanda" }, { code: "IT", label: "Italia" },
  { code: "NO", label: "Noruega" }, { code: "NL", label: "Países Bajos" }, { code: "PL", label: "Polonia" },
  { code: "PT", label: "Portugal" }, { code: "GB", label: "Reino Unido" }, { code: "CZ", label: "República Checa" },
  { code: "SE", label: "Suecia" }, { code: "CH", label: "Suiza" },
];
export const COUNTRIES: readonly { code: string; label: string }[] = [
  { code: "ES", label: "España" },
  ...[...OTHER_COUNTRIES].sort((a, b) => a.label.localeCompare(b.label, "es")),
];
const KNOWN = new Set(COUNTRIES.map((c) => c.code));

// One of COUNTRIES, exactly as stored (upper case)
export const isCountryCode = (code: string): boolean => KNOWN.has(code);

// The País select of the store form: "" (Sin definir) or one of COUNTRIES
export function countryInput(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (code && !isCountryCode(code)) throw new Error("País no válido. Elige uno de la lista");
  return code;
}

export const countryLabel = (code: string): string => (code ? (COUNTRIES.find((c) => c.code === code)?.label ?? code) : "Sin definir");

// "es" / "ES" → "ES", "uk" → "GB"; "" when it isn't one of COUNTRIES
function marketCode(raw: string): string {
  const up = raw.toUpperCase();
  const code = up === "UK" ? "GB" : up === "ESP" ? "ES" : up;
  return KNOWN.has(code) ? code : "";
}

// Last labels of a host that are a country's own domain (.com.es and .co.uk end in one too)
const TLD_COUNTRY: Record<string, string> = {
  es: "ES", pt: "PT", fr: "FR", de: "DE", it: "IT", uk: "GB", ie: "IE", nl: "NL", be: "BE", at: "AT", ch: "CH",
  pl: "PL", se: "SE", dk: "DK", fi: "FI", no: "NO", cz: "CZ",
};

// " DE", "(FR)", "- UK" closing a name, in capitals ("Just do it" is not Italy)
const NAME_TAG = /(?:[\s(\-–|/])(ESP|ES|DE|FR|IT|UK|GB|PT|NL|BE|AT|CH|PL|SE|DK|FI|IE|NO|CZ|US)\)?\s*$/;
const SLUG_TAG = /-(es|de|fr|it|uk|pt|ch|nl)$/;
// a path or subdomain made of a language or country code: "/de", "/fr-fr", "/de_CH", "es."; "en" and "ca" (Catalan) are no market
const LOCALE = /^([a-z]{2})(?:[-_]([a-z]{2}))?$/i;
const NOT_A_MARKET = new Set(["en", "ca", "eu"]);
const QUERY_KEYS = ["country", "locale"];
const DESTINATION_KEYS = ["url", "murl", "u", "ulp", "destination", "wgtarget"];

export type StoreSignals = { name: string; slug: string; website: string; trackingUrl?: string };
export type InferredCountry = { country: string; reason: string };

function localeCountry(raw: string): string {
  const m = raw.match(LOCALE);
  if (!m) return "";
  if (m[2]) return marketCode(m[2]);
  return NOT_A_MARKET.has(m[1].toLowerCase()) ? "" : marketCode(m[1]);
}

const parsed = (website: string): URL | null => {
  const s = website.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  return URL.canParse(withScheme) ? new URL(withScheme) : null;
};

function fromName(name: string): InferredCountry | null {
  const code = marketCode(name.trim().match(NAME_TAG)?.[1] ?? "");
  return code ? { country: code, reason: `nombre «${name.trim()}»` } : null;
}

// "myprotein-de", unless that ending is just the last word of the name ("Just do it" → just-do-it)
function fromSlug(slug: string, name: string): InferredCountry | null {
  const tag = slug.trim().toLowerCase().match(SLUG_TAG)?.[1];
  if (!tag) return null;
  const lastWord = name.trim().split(/[\s()\-–|/]+/).filter(Boolean).pop() ?? "";
  if (lastWord.toLowerCase() === tag) return null;
  const code = marketCode(tag);
  return code ? { country: code, reason: `slug -${tag}` } : null;
}

function fromTld(host: string): InferredCountry | null {
  const tld = host.split(".").pop() ?? "";
  return host.includes(".") && TLD_COUNTRY[tld] ? { country: TLD_COUNTRY[tld], reason: `dominio .${tld}` } : null;
}

function fromSubdomain(host: string): InferredCountry | null {
  const labels = host.replace(/^www\d?\./, "").split(".");
  if (labels.length < 3 || labels[0].length !== 2) return null;
  const code = localeCountry(labels[0]);
  return code ? { country: code, reason: `subdominio ${labels[0]}.` } : null;
}

function fromPath(u: URL): InferredCountry | null {
  const first = u.pathname.split("/").filter(Boolean)[0] ?? "";
  const code = localeCountry(first);
  return code ? { country: code, reason: `ruta /${first}` } : null;
}

function fromQuery(u: URL): InferredCountry | null {
  for (const key of QUERY_KEYS) {
    const v = u.searchParams.get(key) ?? "";
    const code = localeCountry(v);
    if (code) return { country: code, reason: `parámetro ${key}=${v}` };
  }
  return null;
}

// A tracking link with the shop's page fixed in it (not the {url} placeholder): that page's domain
function fromTracking(trackingUrl: string): InferredCountry | null {
  const u = parsed(trackingUrl);
  if (!u) return null;
  for (const key of DESTINATION_KEYS) {
    const dest = parsed(u.searchParams.get(key) ?? "");
    const tld = dest && /^https?:$/.test(dest.protocol) ? fromTld(dest.hostname.toLowerCase()) : null;
    if (tld) return { country: tld.country, reason: `enlace de seguimiento a ${tld.reason.replace("dominio ", "")}` };
  }
  return null;
}

// Which country a store sells in, read from its name, slug and website; null = no signal (a plain .com).
// A tag in the name or slug comes first, then the country's own domain, then a country subdomain, path or parameter.
export function inferStoreCountry({ name, slug, website, trackingUrl = "" }: StoreSignals): InferredCountry | null {
  const u = parsed(website);
  const host = u ? hostOf(website) : "";
  return (
    fromName(name) ??
    fromSlug(slug, name) ??
    (host ? fromTld(host) ?? fromSubdomain(host) : null) ??
    (u ? fromPath(u) ?? fromQuery(u) : null) ??
    fromTracking(trackingUrl)
  );
}

export type CountryStore = { name: string; slug: string; website: string; country?: string; country_source?: string; tracking_url?: string };

// The stored country, else the inferred one (inferred: true), else ""
export function effectiveCountry(s: CountryStore): { country: string; inferred: boolean; reason: string } {
  const stored = (s.country ?? "").trim().toUpperCase();
  if (stored) return { country: stored, inferred: false, reason: "" };
  const guess = inferStoreCountry({ name: s.name, slug: s.slug, website: s.website, trackingUrl: s.tracking_url });
  return guess ? { country: guess.country, inferred: true, reason: guess.reason } : { country: "", inferred: false, reason: "" };
}

// The public site is Spanish: a store set to ES is on it; one set to, or read as, another country is not;
// with no country at all, the website's ending decides (isSpanishMarket). A network's region is weaker than what the
// store itself says: a programme we joined in Spain may be filed under another primary region (Awin's primaryRegion),
// so a store whose name, domain or path reads ES stays on the site whatever the network says.
export function onSpanishSite(s: CountryStore): boolean {
  const stored = (s.country ?? "").trim().toUpperCase();
  if (stored === "ES") return true;
  if (stored && s.country_source === "network") {
    const guess = inferStoreCountry({ name: s.name, slug: s.slug, website: s.website, trackingUrl: s.tracking_url });
    return guess?.country === "ES" && isSpanishMarket(s.website);
  }
  if (stored) return false;
  const { country } = effectiveCountry(s);
  return (country === "" || country === "ES") && isSpanishMarket(s.website);
}
