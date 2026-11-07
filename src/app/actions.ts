"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { fillStoreIcons } from "@/lib/fill-store-icons";
import { fillProductImages } from "@/lib/fill-product-images";
import { sql, type Client } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { mapStoreLines } from "@/lib/store-import";
import { asNetwork } from "@/lib/affiliate";
import { storeCategory } from "@/lib/catalog";
import { countryInput } from "@/lib/market";
import { isMissingCountry } from "@/lib/country-column";
import { altDomainsColumn } from "@/lib/tracking-columns";
import { altDomainsInput } from "@/lib/tracked-link";
import { cleanDisguise, cleanFontFamily, darkSvgDataUri, decodeHtml, isSvgUrl, isWhiteSvg, MAX_SVG_LOGO, validLogo, extractDisguise, siteDigest, type Disguise } from "@/lib/disguise";
import { disguiseFromDigest, storesFromText } from "@/lib/ai-content";
import { lookup } from "node:dns/promises";
import {
  bareDomain, digits, errorMessage, hexColor, ids, isoDate, required, slugify, str, url, type FormState,
} from "@/lib/form";
import { canSeeClient, requireAdmin, requireEditor } from "@/lib/auth";
import { newToken, verifyPassword } from "@/lib/password";
import { appUrl, hashToken, MAGIC_LINK_COOLDOWN_SECONDS, MAGIC_LINK_MINUTES, magicLinkEmail, sendEmail } from "@/lib/email";
import { SESSION_COOKIE, safeNext } from "@/lib/session";
import { startSession } from "@/lib/start-session";

export type { FormState } from "@/lib/form";

// Access control: the proxy only checks the cookie signature; every action below re-checks the user and role.

// ---------- sign in ----------

const FAILED_LOGIN_DELAY_MS = 600;

export async function login(_prev: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email").toLowerCase();
  const [user] = await sql()<{ id: number; password_hash: string | null; status: string; session_version: number }[]>`
    SELECT id, password_hash, status, session_version FROM users WHERE email = ${email}`;
  // same message and delay whether the email exists or not, so it can't be used to probe accounts
  if (!user || user.status !== "active" || !(await verifyPassword(str(f, "password"), user.password_hash))) {
    await new Promise((r) => setTimeout(r, FAILED_LOGIN_DELAY_MS));
    return { error: "Email o contraseña incorrectos." };
  }
  await startSession(user.id, user.session_version);
  redirect(safeNext(str(f, "next")));
}

export type MagicLinkState = FormState & { sentTo?: string };

// Same answer whether or not the email has an account, so the form can't probe who's registered
export async function requestMagicLink(_prev: MagicLinkState, f: FormData): Promise<MagicLinkState> {
  const email = str(f, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Escribe un email válido." };
  const token = newToken();
  const [user] = await sql()<{ name: string }[]>`
    UPDATE users SET login_token_hash = ${hashToken(token)}, login_expires_at = now() + ${MAGIC_LINK_MINUTES} * interval '1 minute'
    WHERE email = ${email} AND status = 'active'
      AND (login_expires_at IS NULL OR login_expires_at < now() + ${MAGIC_LINK_MINUTES * 60 - MAGIC_LINK_COOLDOWN_SECONDS} * interval '1 second')
    RETURNING name`;
  if (user) {
    const link = `${appUrl()}/login/magic?token=${token}&next=${encodeURIComponent(safeNext(str(f, "next")))}`;
    try {
      await sendEmail(email, magicLinkEmail(user.name, link));
    } catch (e) {
      console.error("[magic-link] send failed", e);
    }
  }
  return { sentTo: email };
}

// POST (button on /login/magic), not GET: mail scanners that prefetch links would burn the token
export async function consumeMagicLink(_prev: FormState, f: FormData): Promise<FormState> {
  const token = str(f, "token");
  const [user] = /^[0-9a-f]{64}$/.test(token)
    ? await sql()<{ id: number; session_version: number }[]>`
        UPDATE users SET login_token_hash = NULL, login_expires_at = NULL
        WHERE login_token_hash = ${hashToken(token)} AND login_expires_at > now() AND status = 'active'
        RETURNING id, session_version`
    : [];
  if (!user) return { error: "El enlace ha caducado o ya se usó." };
  await startSession(user.id, user.session_version);
  redirect(safeNext(str(f, "next")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------- clients ----------

// Reads a publisher's homepage and extracts the demo disguise from it.
// ponytail: server-side fetch of an admin-entered domain (admins only); add an allowlist/SSRF guard before opening the panel to customers
async function fetchDisguise(domain: string): Promise<Disguise> {
  const host = bareDomain(domain);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(host)) {
    throw new Error("Dominio inválido");
  }
  const home = `https://${host}/`;
  const res = await fetch(home, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; CuponLab/0.1)" },
    signal: AbortSignal.timeout(10_000),
    redirect: "follow",
  });
  // bot walls (Akamai, Cloudflare…) answer 401/403: we don't try to get past them, we ask the model what it knows of the brand
  if (res.status === 401 || res.status === 403) {
    const guess = await disguiseFromDigest(`URL: ${home}\nSu web bloquea la lectura automática: no hay datos de la página.`, host);
    return { ...cleanDisguise(guess, {}, []), guessed: true };
  }
  if (!res.ok) throw new Error(`Su web no deja leerla (HTTP ${res.status})`);
  const html = decodeHtml(await res.arrayBuffer(), res.headers.get("content-type"));
  const base = res.url || home;
  const fallback = extractDisguise(html, base);
  const { text, logos } = siteDigest(html, base, await stylesheetsOf(html, base));
  try {
    const d = cleanDisguise(await disguiseFromDigest(text, host), fallback, logos);
    return d.logoUrl ? { ...d, logoUrl: (await darkenedWhiteLogo(d.logoUrl)) ?? d.logoUrl } : d;
  } catch (e) {
    // the regex result is still usable; log why the model step failed (gateway auth, quota…)
    console.error("disguiseFromDigest failed, using regex extraction", e);
    return fallback;
  }
}

// Colours and fonts usually live in external CSS: read the first two stylesheets (capped), skip any that fail.
async function stylesheetsOf(html: string, base: string): Promise<string> {
  const hrefs = [...html.matchAll(/<link\b[^>]*rel\s*=\s*["']?stylesheet[^>]*>/gi)]
    .map((m) => m[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1])
    .flatMap((h) => (h && URL.canParse(h.replace(/&amp;/g, "&"), base) ? [new URL(h.replace(/&amp;/g, "&"), base)] : []))
    .filter((u) => u.protocol === "https:")
    .slice(0, 2);
  const sheets = await Promise.all(
    hrefs.map((u) =>
      fetch(u, { signal: AbortSignal.timeout(5_000) })
        .then((r) => (r.ok ? r.text() : ""))
        .then((t) => t.slice(0, 600_000))
        .catch((e) => {
          console.error("stylesheet fetch failed", u.href, e);
          return "";
        }),
    ),
  );
  return sheets.join("\n");
}

function checkedLogo(v: string) {
  if (!validLogo(v)) throw new Error("El logo debe ser una URL http(s)");
  return v;
}

// A white-only SVG logo comes back repainted dark as a data: URI; anything else → undefined (keep the URL)
async function darkenedWhiteLogo(url: string): Promise<string | undefined> {
  if (!isSvgUrl(url)) return undefined;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CuponLab/0.1)" }, signal: AbortSignal.timeout(5_000) });
    const svg = res.ok ? await res.text() : "";
    return svg.length <= MAX_SVG_LOGO && isWhiteSvg(svg) ? darkSvgDataUri(svg) : undefined;
  } catch (e) {
    console.error("logo check failed", url, e);
    return undefined;
  }
}

// Used by the "new client" form: returns the disguise without saving anything
export async function previewDisguise(domain: string): Promise<{ disguise?: Disguise; error?: string }> {
  try {
    await requireAdmin();
    return { disguise: await fetchDisguise(domain) };
  } catch (e) {
    return { error: e instanceof Error && e.name === "TimeoutError" ? "Su web tardó demasiado en responder" : errorMessage(e) };
  }
}

export async function createClient(_prev: FormState, f: FormData): Promise<FormState> {
  let s: string;
  try {
    await requireAdmin();
    const name = required(f, "name", "el nombre del medio");
    s = slugify(name);
    if (!s) throw new Error("El nombre necesita letras o números");
    const logo = str(f, "logo_url");
    await sql()`
      INSERT INTO clients (name, slug, domain, awin_affiliate_id, clickref_prefix, brand_color, logo_url, nav_items, font_style, font_family, layout)
      VALUES (${name}, ${s}, ${bareDomain(required(f, "domain", "el dominio"))}, '',
              ${str(f, "clickref_prefix")}, ${hexColor(f, "brand_color")}, ${logo ? checkedLogo(logo) : ""},
              ${str(f, "nav_items")}, ${str(f, "font_style") === "sans" ? "sans" : "serif"},
              ${cleanFontFamily(str(f, "font_family")) ?? ""}, ${str(f, "layout") === "store" ? "store" : "newspaper"})`;
    await logActivity(`Nuevo cliente: ${name}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/panel/clients");
  redirect(`/panel/clients/${s}?created=1`);
}

export async function updateClient(f: FormData) {
  const user = await requireEditor();
  const s = required(f, "slug");
  const [target] = await sql()<{ id: number }[]>`SELECT id FROM clients WHERE slug = ${s}`;
  if (!target || !canSeeClient(user, target.id)) throw new Error("No tienes acceso a este cliente");
  await sql()`
    UPDATE clients SET domain = ${bareDomain(str(f, "domain"))}
    WHERE slug = ${s}`;
  revalidatePath(`/panel/clients/${s}`);
}

export async function updateDisguise(f: FormData) {
  const user = await requireEditor();
  const s = required(f, "slug");
  const [target] = await sql()<{ id: number }[]>`SELECT id FROM clients WHERE slug = ${s}`;
  if (!target || !canSeeClient(user, target.id)) throw new Error("No tienes acceso a este cliente");
  const logo = str(f, "logo_url");
  await sql()`
    UPDATE clients SET name = ${required(f, "name", "el nombre")}, logo_url = ${logo ? checkedLogo(logo) : ""},
      brand_color = ${hexColor(f, "brand_color")}, nav_items = ${str(f, "nav_items")},
      font_style = ${str(f, "font_style") === "sans" ? "sans" : "serif"},
      font_family = ${cleanFontFamily(str(f, "font_family")) ?? ""}, layout = ${str(f, "layout") === "store" ? "store" : "newspaper"}
    WHERE slug = ${s}`;
  revalidatePath(`/panel/clients/${s}`);
}

// Refills a saved client's disguise from their homepage. Only overwrites what it finds.
export async function generateDisguise(f: FormData) {
  const user = await requireEditor();
  const s = required(f, "slug");
  const [target] = await sql()<{ id: number }[]>`SELECT id FROM clients WHERE slug = ${s}`;
  if (!target || !canSeeClient(user, target.id)) throw new Error("No tienes acceso a este cliente");
  const [client] = await sql()<Client[]>`SELECT * FROM clients WHERE slug = ${s}`;
  if (!client?.domain) throw new Error("El cliente necesita un dominio");
  const d = await fetchDisguise(client.domain);
  await sql()`
    UPDATE clients SET name = ${d.name ?? client.name}, logo_url = ${d.logoUrl ?? client.logo_url},
      brand_color = ${d.color ?? client.brand_color}, nav_items = ${d.nav?.join(", ") ?? client.nav_items},
      font_style = ${d.font ?? client.font_style}, font_family = ${d.fontFamily ?? client.font_family},
      layout = ${d.layout ?? client.layout}
    WHERE slug = ${s}`;
  revalidatePath(`/panel/clients/${s}`);
}

// ---------- stores ----------

// Every store keeps its advertiser id in its network (what the sync matches on); Awin builds links from it,
// any other network keeps the tracking link it gives ({url}/{ref} placeholders)
function storeTracking(f: FormData) {
  const network = asNetwork(str(f, "network"));
  // Awin ids are numbers; Affilae's are hex and Partnerize's mix letters ("10l176")
  const merchant_id = network === "awin" ? digits(f, "merchant_id", "El ID del anunciante") : str(f, "merchant_id");
  if (!/^[\w-]*$/.test(merchant_id)) throw new Error("El ID del anunciante solo lleva letras, números y guiones");
  if (network === "awin") return { network, merchant_id, tracking_url: "" };
  // "{url}?ae=…" (Affilae) tracks on the shop's own page: it isn't a URL by itself
  const template = str(f, "tracking_url");
  if (/^\{url\}[?&][^\s]+$/.test(template)) return { network, merchant_id, tracking_url: template };
  return { network, merchant_id, tracking_url: template ? url(f, "tracking_url", "El enlace de seguimiento") : "" };
}

export async function createStore(_prev: FormState, f: FormData): Promise<FormState> {
  let s: string;
  try {
    await requireEditor();
    const name = required(f, "name", "el nombre");
    s = slugify(name);
    if (!s) throw new Error("El nombre necesita letras o números");
    const t = storeTracking(f);
    const r = await sql()`
      INSERT INTO stores (name, slug, website, network, merchant_id, tracking_url)
      VALUES (${name}, ${s}, ${url(f, "website", "La web")}, ${t.network}, ${t.merchant_id}, ${t.tracking_url})
      ON CONFLICT (slug) DO NOTHING`;
    if (!r.count) throw new Error(`Ya hay una tienda «${name}»`);
    await logActivity(`Nueva tienda: ${name}`);
    const created = s;
    after(() => fillStoreIcons([created]));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/panel/stores/${s}`);
}

export type ImportStoresState = FormState & { imported?: number; problems?: string[]; guessed?: string[]; rejected?: string };

export async function importStores(_prev: ImportStoresState, f: FormData): Promise<ImportStoresState> {
  try {
    await requireEditor();
    const text = str(f, "list");
    if (!text) throw new Error("Pega al menos una tienda");
    if (text.length > 20_000) throw new Error("El texto es demasiado largo (máx. 20.000 caracteres)");
    const { lines, guessed, aiFailed } = await normaliseStoreText(text);
    const parsed = mapStoreLines(lines);
    const { stores, errors, rejected } = await dropUnknownDomains(parsed);
    const network = asNetwork(str(f, "network"));
    let imported = 0;
    const newSlugs: string[] = [];
    for (const st of stores) {
      // a store with the same slug already in the panel is left as it is; the number on each line is Awin's
      // merchant ID, other networks get their tracking link later on the store page
      const r = await sql()`
        INSERT INTO stores (name, slug, website, network, merchant_id)
        VALUES (${st.name}, ${st.slug}, ${st.website}, ${network}, ${network === "awin" ? st.merchant_id : ""})
        ON CONFLICT (slug) DO NOTHING`;
      imported += r.count;
      if (r.count) newSlugs.push(st.slug);
    }
    after(() => fillStoreIcons(newSlugs));
    const existing = stores.length - imported;
    if (imported) await logActivity(`${imported} tienda(s) añadidas desde una lista`);
    revalidatePath("/", "layout");
    const added = new Set(stores.map((st) => st.name));
    return {
      imported,
      problems: [
        ...(aiFailed ? ["La IA no respondió: se ha leído la lista tal cual"] : []),
        ...errors,
        ...(existing ? [`${existing} ya estaban en el panel y se han dejado como estaban`] : []),
      ],
      guessed: guessed.filter((g) => added.has(g.name)).map((g) => `${g.name} → ${g.website.replace(/^https?:\/\//, "")}`),
      rejected: rejected.join("\n"),
    };
  } catch (e) {
    return { error: errorMessage(e), rejected: str(f, "list") }; // keep what they pasted
  }
}

// Any pasted text → "name<TAB>web<TAB>id" lines via the model; on failure the raw text goes to the plain parser.
async function normaliseStoreText(text: string) {
  try {
    const found = await storesFromText(text);
    const lines = found.map((s) => [s.name, s.website, /^\d+$/.test(s.merchantId) ? s.merchantId : ""].join("\t")).join("\n");
    // a website the user didn't write is the model's guess: show it for review
    const guessed = found.filter((s) => s.website && !text.toLowerCase().includes(hostOf(s.website)));
    return { lines, guessed, aiFailed: false };
  } catch (e) {
    console.error("storesFromText failed, parsing the list as is", e);
    return { lines: text, guessed: [], aiFailed: true };
  }
}

const hostOf = (url: string) => (URL.canParse(url) ? new URL(url).hostname.replace(/^www\./, "") : url);

// Model-made domains can be wrong: keep only those that resolve in DNS
async function dropUnknownDomains(p: ReturnType<typeof mapStoreLines>) {
  const ok = await Promise.all(p.stores.map((st) => lookup(new URL(st.website).hostname).then(() => true, () => false)));
  const bad = p.stores.filter((_, i) => !ok[i]);
  return {
    stores: p.stores.filter((_, i) => ok[i]),
    errors: [...p.errors, ...bad.map((st) => `«${st.name}»: no encuentro ${hostOf(st.website)}, revisa la web`)],
    rejected: [...p.rejected, ...bad.map((st) => `${st.name}\t${st.website}`)],
  };
}

// A country picked in the panel is 'manual' (network syncs and the backfill leave it alone); saving the form with the
// same country keeps where it came from. true when the columns don't exist yet (npm run db:setup).
async function saveManualCountry(slug: string, country: string): Promise<boolean> {
  try {
    await sql()`
      UPDATE stores SET country = ${country}, country_source = 'manual'
      WHERE slug = ${slug} AND country <> ${country}`;
    return false;
  } catch (e) {
    if (isMissingCountry(e)) return true;
    throw e;
  }
}

// The store's other domains (see storeDomains). true when the column doesn't exist yet and something was typed.
async function saveAltDomains(slug: string, domains: string): Promise<boolean> {
  try {
    await sql()`UPDATE stores SET alt_domains = ${domains} WHERE slug = ${slug} AND alt_domains <> ${domains}`;
    return false;
  } catch (e) {
    if (altDomainsColumn.isMissing(e)) return domains !== "";
    throw e;
  }
}

export async function updateStore(_prev: FormState, f: FormData): Promise<FormState> {
  const s = required(f, "slug");
  try {
    await requireEditor();
    const t = storeTracking(f);
    const country = f.has("country") ? countryInput(str(f, "country")) : null;
    await sql()`
      UPDATE stores SET website = ${url(f, "website", "La web")}, network = ${t.network}, merchant_id = ${t.merchant_id},
        tracking_url = ${t.tracking_url},
        intro = ${str(f, "intro")}, faqs = ${str(f, "faqs")},
        category = ${storeCategory(str(f, "category"))}, facts = ${str(f, "facts")}
      WHERE slug = ${s}`;
    if (country !== null) {
      const missing = await saveManualCountry(s, country);
      if (missing && country) return { error: "Guardado, salvo el país. Ejecuta npm run db:setup para poder guardarlo" };
    }
    if (f.has("alt_domains")) {
      const missing = await saveAltDomains(s, altDomainsInput(str(f, "alt_domains")));
      if (missing) return { error: "Guardado, salvo los otros dominios. Ejecuta npm run db:setup para poder guardarlos" };
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/panel/stores/${s}`);
  return {};
}

// ---------- coupons ----------

export async function deleteCoupon(f: FormData) {
  await requireEditor();
  await sql()`DELETE FROM coupons WHERE id = ${Number(required(f, "id"))}`;
  revalidatePath(`/panel/stores/${required(f, "store_slug")}`);
}

// Create (no id) or update (id) from the coupon drawer
export async function saveCoupon(_prev: FormState, f: FormData): Promise<FormState> {
  const back = /^\/panel\/(coupons|stores\/[a-z0-9-]+)(\?|$)/.test(str(f, "back")) ? str(f, "back") : "/panel/coupons";
  try {
    await requireEditor();
    const kind = str(f, "kind") === "deal" ? "deal" : "code";
    const c = {
      store_id: Number(required(f, "store_id", "la tienda")),
      kind,
      title: required(f, "title", "el título"),
      code: kind === "code" ? required(f, "code", "el código").toUpperCase() : "",
      discount: str(f, "discount"),
      description: str(f, "description"),
      target_url: url(f, "target_url", "La URL destino"),
      expires_at: isoDate(f, "expires_at"),
      verified: f.get("verified") ? 1 : 0,
      archived: 0,
    };
    const id = Number(str(f, "id"));
    // reader-shared deals waiting for review (or rejected) are only handled on /panel/moderacion: never published from here
    // an edit locks the text against the network sync (text_locked), so the correction survives the next sync
    if (id) await sql()`UPDATE coupons SET ${sql()({ ...c, text_locked: true })} WHERE id = ${id} AND review = ''`;
    else {
      await sql()`INSERT INTO coupons ${sql()(c)}`;
      await logActivity(`Nuevo cupón: ${c.title}`);
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/panel/coupons");
  revalidatePath("/panel/stores", "layout");
  redirect(back);
}

export async function verifyCoupons(f: FormData) {
  await requireEditor();
  const list = ids(f);
  if (!list.length) return;
  await sql()`UPDATE coupons SET verified = 1 WHERE id IN ${sql()(list)}`;
  await logActivity(list.length === 1 ? "Cupón verificado" : `${list.length} cupones verificados`);
  // web finds are published here: look for their product photo once
  after(() => fillProductImages(list));
  revalidatePath("/", "layout");
}

export async function archiveCoupons(f: FormData) {
  await requireEditor();
  const list = ids(f);
  if (!list.length) return;
  await sql()`UPDATE coupons SET archived = 1 WHERE id IN ${sql()(list)}`;
  await logActivity(`${list.length} cupón(es) retirados de las páginas`);
  revalidatePath("/", "layout");
}
