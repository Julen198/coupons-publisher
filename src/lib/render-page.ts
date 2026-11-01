import type { Client, Coupon, Store } from "./db";
import { affiliateUrl, pageTitle, parseFaqs, trackingUrl } from "./affiliate.ts";
import { discountBadge } from "./discount.ts";

const badge = (c: Pick<Coupon, "discount">) => discountBadge(c.discount) || "Oferta";
// "2026-10-31" → "31/10/2026"
const fmtExpiry = (iso: string) => iso.split("-").reverse().join("/");

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// The client's own web font when known (font_family is sanitised to letters/digits/spaces on save),
// else a generic stack. ponytail: assumes Google Fonts hosts it; if not, the browser just uses the fallback
export function clientFont(client: Pick<Client, "font_family" | "font_style">): { stack: string; link: string } {
  const generic = client.font_style === "sans" ? "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" : "Georgia,'Times New Roman',serif";
  const f = client.font_family;
  if (!f) return { stack: generic, link: "" };
  const href = `https://fonts.googleapis.com/css2?family=${f.replace(/ /g, "+")}:ital,wght@0,400;0,600;0,700;1,400&display=swap`;
  return { stack: `'${f}',${generic}`, link: `<link rel="stylesheet" href="${esc(href)}">` };
}

// The Awin link for one coupon on one client's page; clickref = client-store-coupon for attribution
export function couponAffiliateUrl(client: Client, store: Store, c: Pick<Coupon, "id" | "target_url">) {
  const clickref = [client.clickref_prefix, store.slug, c.id].filter(Boolean).join("-");
  if (store.network !== "awin") return trackingUrl(store.tracking_url, c.target_url, clickref);
  return affiliateUrl(c.target_url, { affiliateId: client.awin_affiliate_id, merchantId: store.awin_merchant_id, clickref });
}

// Standalone HTML the client pastes into their CMS or serves as-is.
// With trackBase (absolute origin), buttons go through /go so the click is counted before redirecting to Awin.
// With logoBase (our absolute origin), each card shows the store's icon from /store-logo/<slug>.
export function renderPage(client: Client, store: Store, coupons: Coupon[], now: Date, trackBase?: string, logoBase?: string): string {
  const title = pageTitle(store.name, coupons.map((c) => c.discount), now);
  const faqs = parseFaqs(store.faqs);
  const updated = now.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  const link = (c: Coupon) =>
    trackBase ? `${trackBase}/go/${encodeURIComponent(client.slug)}/${c.id}` : couponAffiliateUrl(client, store, c);
  const logo =
    store.has_logo && logoBase
      ? `<img class="cp-logo" src="${esc(`${logoBase}/store-logo/${encodeURIComponent(store.slug)}`)}" alt="${esc(store.name)}" loading="lazy" onerror="this.remove()">`
      : "";

  const cards = coupons
    .map(
      (c) => `
    <article class="cp">
      <div class="cp-off${badge(c).length > 5 ? " sm" : ""}">${logo}${esc(badge(c))}</div>
      <div class="cp-body">
        <h3>${esc(c.title)}</h3>
        ${c.description ? `<p>${esc(c.description)}</p>` : ""}
        <small>${c.verified ? "✔ Verificado" : ""}${c.expires_at ? ` · Caduca el ${esc(fmtExpiry(c.expires_at))}` : ""}</small>
      </div>
      <a class="cp-btn" href="${esc(link(c))}" target="_blank" rel="sponsored noopener"
        ${c.kind === "code" ? `data-code="${esc(c.code)}"` : ""}>${c.kind === "code" ? "Ver cupón" : "Ver descuento"}</a>
    </article>`,
    )
    .join("");

  const faqLd = faqs.length
    ? `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      }).replace(/</g, "\\u003c")}</script>`
    : "";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(`Códigos descuento ${store.name} verificados y actualizados. ${store.intro}`.slice(0, 160))}">
${faqLd}
${clientFont(client).link}
<style>
  body{font-family:${client.font_family ? clientFont(client).stack : "system-ui,sans-serif"};max-width:760px;margin:0 auto;padding:16px;color:#1a1a1a;line-height:1.5}
  .disc{font-size:13px;color:#666;border-bottom:1px solid #eee;padding-bottom:8px}
  .meta{font-size:13px;color:#666}
  .cp{display:flex;gap:16px;align-items:center;border:1px solid #e5e5e5;border-radius:10px;padding:14px;margin:12px 0}
  .cp-off{min-width:72px;max-width:96px;text-align:center;font-weight:700;font-size:20px;line-height:1.15;color:${esc(client.brand_color)}}
  .cp-off.sm{font-size:15px}
  .cp-logo{display:block;width:48px;height:48px;margin:0 auto 6px;object-fit:contain;border:1px solid #eee;border-radius:8px;padding:4px;background:#fff;box-sizing:border-box}
  .cp-body{flex:1}.cp-body h3{margin:0;font-size:16px}.cp-body p{margin:4px 0;font-size:14px}.cp-body small{color:#2a7a2a}
  .cp-btn{background:${esc(client.brand_color)};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;white-space:nowrap}
  .cp-btn.revealed{background:#fff;color:#1a1a1a;border:2px dashed ${esc(client.brand_color)};font-family:monospace}
  @media(max-width:560px){.cp{flex-wrap:wrap}.cp-btn{width:100%;text-align:center}}
</style></head><body>
<p class="disc">Cuando compras con nuestros enlaces, ${esc(client.name)} puede recibir una comisión.</p>
<h1>Código descuento ${esc(store.name)} ${now.getFullYear()}</h1>
<p class="meta">Actualizado ${updated}</p>
<p>${esc(store.intro)}</p>
${cards}
${faqs.length ? `<h2>Preguntas frecuentes sobre ${esc(store.name)}</h2>${faqs.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}` : ""}
<script>
  document.querySelectorAll('.cp-btn[data-code]').forEach(function (b) {
    b.addEventListener('click', function () { b.textContent = b.dataset.code; b.classList.add('revealed'); });
  });
  // when embedded by the widget, tell the host page our height so it can size the iframe
  if (window.parent !== window) {
    var report = function () { window.parent.postMessage({ cpHeight: document.documentElement.scrollHeight }, '*'); };
    report();
    new ResizeObserver(report).observe(document.body);
  }
</script>
</body></html>`;
}
