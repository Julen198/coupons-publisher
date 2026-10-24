import type { Client, Store } from "./db";
import { clientFont, esc } from "./render-page.ts";

// Mock of the client's news site with the coupon page embedded, to show a prospect how it would look.
// ponytail: generic newspaper shell, not their real site — swap for a screenshot/real template per client if sales asks
interface DemoOptions {
  moduleHtml: string; // the public coupon page, inlined via srcdoc so unsaved previews work too
  storeHref: (storeSlug: string) => string; // keeps the rest of the query (preview params) when switching store
  moduleLink?: string; // "only the module" link; omitted for unsaved previews
  bar?: boolean; // the dark "Vista demo" bar; off when the page generator embeds the demo as its preview
}

export function renderDemo(client: Client, stores: Store[], current: Store, opts: DemoOptions): string {
  const color = esc(client.brand_color);
  const name = esc(client.name);
  const domain = esc(client.domain || client.name); // unsaved previews may have no domain yet
  const options = stores
    .map((s) => `<option value="${esc(s.slug)}"${s.id === current.id ? " selected" : ""}>${esc(s.name)}</option>`)
    .join("");
  const { stack: font, link: fontLink } = clientFont(client);
  const shop = client.layout === "store";
  // shops use their font everywhere; newspapers keep a serif masthead over sans UI text
  const ui = shop ? font : "system-ui,sans-serif";
  const sections = client.nav_items.split(",").map((s) => s.trim()).filter(Boolean);
  const nav = (sections.length ? sections : ["Portada", "España", "Economía", "Deportes", "Estilo"])
    .map((s) => `<span>${esc(s)}</span>`)
    .join("");
  const logo = client.logo_url
    ? `<img src="${esc(client.logo_url)}" alt="${name}" style="height:${shop ? 36 : 56}px;width:auto;max-width:min(420px,90%);object-fit:contain" onerror="var d=document.createElement('div');d.className='logo';d.textContent=this.alt;this.replaceWith(d)">`
    : `<div class="logo">${name}</div>`;
  const more = stores
    .filter((s) => s.id !== current.id)
    .map((s) => `<li><a href="${esc(opts.storeHref(s.slug))}">Código descuento ${esc(s.name)}</a></li>`)
    .join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Demo · ${name} · ${esc(current.name)}</title>
${fontLink}
<style>
  *{box-sizing:border-box}body{margin:0;font-family:${font};color:#1a1a1a;background:#fff}
  .demo{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:8px 16px;background:#111827;color:#f9fafb;font:13px system-ui,sans-serif}
  .demo select{font:inherit;padding:4px 8px;border-radius:6px}
  .demo a{color:#93c5fd}
  header{border-bottom:4px solid ${color};padding:16px;text-align:center}
  header .logo{font-size:40px;font-weight:700;color:${color};letter-spacing:-.02em}
  header .date{font:12px system-ui,sans-serif;color:#555}
  nav{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 20px;padding:10px 16px;border-bottom:1px solid #ddd;font:600 14px ${ui}}
  header.shop{border:0;padding:0;text-align:left}
  .bar{display:flex;align-items:center;gap:24px;padding:16px 32px}
  .bar .logo{font-size:26px}
  .search{flex:0 1 500px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 5px 5px 20px;border:1px solid #1a1a1a;border-radius:999px;color:#555;font:15px ${ui}}
  .search b{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:${color};color:#fff}
  .icons{display:flex;gap:18px;color:#1a1a1a}
  nav.shopnav{border:0;padding:18px 32px;gap:8px 28px;text-transform:uppercase;letter-spacing:.12em;font:600 13px ${ui}}
  nav.shopnav span{color:#1a1a1a}
  @media (max-width:640px){.search{display:none}.bar{padding:12px 16px}nav.shopnav{padding:12px 16px;gap:8px 18px}}
  nav span{color:#333}nav .on{color:${color};border-bottom:2px solid ${color}}
  .wrap{max-width:1180px;margin:0 auto;padding:16px;display:flex;flex-wrap:wrap;gap:32px}
  main{flex:999 1 600px;min-width:0}
  .crumbs{font:12px ${ui};color:#555;margin-bottom:8px}
  iframe{width:100%;border:0;display:block;min-height:600px}
  aside{flex:1 1 280px;font:14px ${ui}}
  aside h2{font-size:15px;border-bottom:2px solid ${color};padding-bottom:6px}
  aside ul{list-style:none;padding:0;margin:0}aside li{padding:8px 0;border-bottom:1px solid #eee}
  aside a{color:#1a1a1a;text-decoration:none}aside a:hover{color:${color}}
  .ad{margin-top:24px;height:250px;border:1px dashed #bbb;display:flex;align-items:center;justify-content:center;color:#777;font-size:12px}
  footer{margin-top:40px;padding:24px 16px;background:#f3f4f6;text-align:center;font:12px ${ui};color:#555}
</style></head><body>
${opts.bar === false ? "" : `<div class="demo">
  <strong>Vista demo</strong><span>Así quedaría en ${domain}</span>
  <label>Tienda <select onchange="var u=new URL(location.href);u.searchParams.set('store',this.value);location.href=u">${options}</select></label>
  ${opts.moduleLink ? `<a href="${esc(opts.moduleLink)}" target="_blank">Solo el módulo ↗</a>` : ""}
</div>`}
${shop ? shopHeader(logo, color) : `<header>${logo}<div class="date">${esc(new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</div></header>`}
<nav${shop ? ' class="shopnav"' : ""}>${nav}<span class="on">Cupones</span></nav>
<div class="wrap">
  <main>
    <div class="crumbs">${name} › Cupones › ${esc(current.name)}</div>
    <iframe id="cp" title="Cupones ${esc(current.name)}" srcdoc="${esc(opts.moduleHtml)}"></iframe>
  </main>
  <aside>
    <h2>Más cupones</h2>
    <ul>${more || "<li>No hay más tiendas</li>"}</ul>
    <div class="ad">[PUBLICIDAD 300×250]</div>
  </aside>
</div>
<footer>© ${name} · Cupones gestionados por Tessera Coupons</footer>
<script>
  // srcdoc is same-origin: grow the iframe to its content so the page scrolls as one
  var f = document.getElementById('cp');
  function fit() { try { f.style.height = f.contentDocument.documentElement.scrollHeight + 'px'; } catch (e) {} }
  f.addEventListener('load', function () { fit(); new ResizeObserver(fit).observe(f.contentDocument.body); });
</script>
</body></html>`;
}

const icon = (d: string) =>
  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

// Online-shop header: menu, logo left, rounded search, account/wishlist/bag icons (decorative)
function shopHeader(logo: string, color: string): string {
  return `<header class="shop"><div class="bar">
  ${icon("M3 6h18M3 12h18M3 18h18")}
  ${logo}
  <div class="search"><span>¿Qué estás buscando?</span><b style="background:${color}">${icon("M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM21 21l-5-5")}</b></div>
  <div class="icons">${icon("M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z")}${icon("M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z")}${icon("M6 7h12l1 14H5L6 7zM9 7a3 3 0 0 1 6 0")}</div>
</div></header>`;
}
