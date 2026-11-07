// The loading page /go shows on its way to the store (SiteRedirect board in the design canvas): the store, the code to
// paste and a link in case the jump doesn't happen. A live coupon jumps on its own after REDIRECT_DELAY_MS; an expired or
// archived one waits for the reader to choose. The click is counted before this page is sent, and the link it opens is
// the same affiliate link the 302 used to send. Only CuponLab's own pages use it (see /go).

export const REDIRECT_DELAY_MS = 800;
export const SLOW_AFTER_MS = 4000;

export interface RedirectPageInput {
  url: string; // where the reader goes: the tracked affiliate link (or the store when untracked)
  storeName: string;
  storeSlug: string;
  hasLogo: boolean;
  code: string; // "" for a deal without a code
  expired: boolean; // expired or archived: no automatic jump
  expiredOn: string; // "31 de octubre", "" when unknown
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);

// Only http(s) targets go into the page: anything else (a javascript: link in bad data) sends the reader home
export const safeTarget = (url: string): string => (/^https?:\/\//i.test(url) ? url : "/");

const TICKET = `<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M10 9l4 6"/>`;
const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#1d4ed8"/><g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(4 4)">${TICKET}</g></svg>`;

const CSS = `
:root{--bg:#f3f5fa;--surface:#fff;--surface-2:#e9edf6;--line:#d9dfeb;--ink:#141a2b;--ink-2:#4a5470;--ink-3:#5f6880;--brand:#1d4ed8;--brand-ink:#fff;--brand-soft:#e3eafc;--ok:#13733a;--ok-soft:#e1f3e6;--drop:#b4380a;--drop-soft:#fdebdd;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0c1120;--surface:#141b2e;--surface-2:#1b2440;--line:#26314f;--ink:#e8ecf6;--ink-2:#aab3cb;--ink-3:#8c96b2;--brand:#6d94ff;--brand-ink:#0c1120;--brand-soft:#1c2a55;--ok:#4ade80;--ok-soft:#12301f;--drop:#fb8a4c;--drop-soft:#3a2116}}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:grid;grid-template-rows:auto 1fr auto;background:var(--bg);color:var(--ink);font:15px/1.55 Archivo,system-ui,-apple-system,"Segoe UI",sans-serif}
h1{margin:0;font-size:1.45rem;line-height:1.15;font-weight:800;letter-spacing:-.01em}p{margin:0}
.top{display:flex;align-items:center;gap:8px;padding:14px 20px;background:var(--surface);border-bottom:1px solid var(--line);font-weight:800;font-size:1.1rem;color:var(--ink);text-decoration:none}
.top svg{width:28px;height:28px}.top b{color:var(--brand)}
.mid{display:grid;grid-template-columns:minmax(0,420px);justify-content:center;align-content:center;gap:28px;padding:24px 16px}
@media (min-width:900px){.mid.has-steps{grid-template-columns:minmax(0,440px) minmax(0,280px);align-items:center}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:28px 24px;display:grid;gap:14px;justify-items:center;text-align:center;box-shadow:0 10px 30px rgba(12,17,32,.10)}
.hop{display:flex;align-items:center;gap:10px}
.me{width:44px;height:44px;border-radius:10px;background:#1d4ed8;display:grid;place-items:center}.me svg{width:24px;height:24px}
.dots{display:flex;gap:5px}.dots i{width:6px;height:6px;border-radius:50%;background:var(--brand);opacity:.25;animation:dot 1.2s infinite}
.dots i:nth-child(2){animation-delay:.2s}.dots i:nth-child(3){animation-delay:.4s}
@keyframes dot{50%{opacity:1}}
.wm{height:44px;min-width:44px;padding:0 10px;border-radius:10px;border:1px solid var(--line);background:#fff;color:#141a2b;display:grid;place-items:center;font-weight:800}
.wm img{max-height:32px;max-width:96px;display:block}
.lead{color:var(--ink-2)}
.code{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1.5px dashed var(--brand);border-radius:10px;background:var(--brand-soft);padding:10px 12px}
.code b{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:1.15rem;letter-spacing:.06em;word-break:break-all;text-align:left}
.pill{font-size:.78rem;font-weight:700;color:var(--ink-3);flex:none}
.noc{width:100%;border-radius:10px;background:var(--ok-soft);color:var(--ok);font-weight:700;font-size:.92rem;padding:10px 12px}
.warn{width:100%;border-radius:10px;background:var(--drop-soft);color:var(--drop);font-weight:600;font-size:.9rem;padding:10px 12px;text-align:left}
.bar{width:100%;height:4px;border-radius:4px;background:var(--surface-2);overflow:hidden}
.bar i{display:block;height:100%;background:var(--brand);transform-origin:left;animation:fill ${REDIRECT_DELAY_MS}ms linear forwards}
@keyframes fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.bar i,.dots i{animation:none}}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;width:100%;border-radius:10px;font:inherit;font-weight:700;border:1px solid var(--line);background:var(--surface);color:var(--ink);text-decoration:none;padding:0 16px}
.btn-primary{background:var(--brand);color:var(--brand-ink);border-color:var(--brand)}
.link{font-size:.88rem;font-weight:600;color:var(--brand);text-underline-offset:3px;padding:8px}
.slow-only{display:none}.slow .slow-only{display:flex}.slow .live-only{display:none}
.steps h2{margin:0 0 10px;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3)}
.steps ol{margin:0;padding-left:20px;display:grid;gap:8px;color:var(--ink-2)}
@media (max-width:899px){.steps{display:none}}
.fine{font-size:.78rem;color:var(--ink-3);text-align:center;padding:14px 16px 20px}
`;

function storeMark(i: RedirectPageInput): string {
  const name = esc(i.storeName);
  return i.hasLogo
    ? `<span class="wm"><img src="/store-logo/${encodeURIComponent(i.storeSlug)}" alt="${name}" width="32" height="32"></span>`
    : `<span class="wm">${name}</span>`;
}

function liveCard(i: RedirectPageInput, href: string): string {
  const name = esc(i.storeName);
  const code = i.code
    ? `<div class="code"><b>${esc(i.code)}</b><span class="pill">Tu código</span></div>
       <p class="lead live-only">Pégalo en la cesta de ${name} antes de pagar.</p>`
    : `<p class="noc">No necesitas código. El descuento se aplica en la web.</p>`;
  return `<section class="card" aria-live="polite">
    <div class="hop"><span class="me" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TICKET}</svg></span><span class="dots live-only" aria-hidden="true"><i></i><i></i><i></i></span>${storeMark(i)}</div>
    <h1><span class="live-only">Te llevamos a ${name}</span><span class="slow-only">${name} está tardando</span></h1>
    ${code}
    <div class="bar live-only" role="progressbar" aria-label="Abriendo la tienda"><i></i></div>
    <a class="link live-only" href="${href}" rel="nofollow sponsored">¿No se abre? Ir a ${name}</a>
    <a class="btn btn-primary slow-only" href="${href}" rel="nofollow sponsored">Ir a ${name}</a>
  </section>`;
}

function expiredCard(i: RedirectPageInput, href: string): string {
  const name = esc(i.storeName);
  const when = i.expiredOn ? `Caducó el ${esc(i.expiredOn)}. ` : "";
  return `<section class="card">
    ${storeMark(i)}
    <h1>Puede que este cupón ya no funcione</h1>
    <p class="warn">${when}Puedes seguir a ${name} igualmente o ver sus cupones de hoy en CuponLab.</p>
    <a class="btn btn-primary" href="${href}" rel="nofollow sponsored">Seguir a ${name}</a>
    <a class="btn" href="/tiendas/${encodeURIComponent(i.storeSlug)}">Ver cupones de ${name}</a>
  </section>`;
}

const STEPS = (name: string) => `<aside class="steps"><h2>Cómo usarlo</h2><ol>
  <li>Añade lo que quieras a la cesta de ${name}.</li><li>Pega el código en «Código promocional».</li><li>Comprueba el descuento antes de pagar.</li></ol></aside>`;

export function redirectPage(i: RedirectPageInput): string {
  const target = safeTarget(i.url);
  const href = esc(target);
  const live = !i.expired;
  const name = esc(i.storeName);
  // the meta refresh only for browsers without JS (inside <noscript>, so a JS browser makes one navigation, not two);
  // the script uses replace() so Atrás skips this page
  const jump = live
    ? `<noscript><meta http-equiv="refresh" content="${Math.ceil(REDIRECT_DELAY_MS / 1000)};url=${href}"></noscript>
<script>(function(){var u=${JSON.stringify(target).replace(/</g, "\\u003c")};setTimeout(function(){location.replace(u)},${REDIRECT_DELAY_MS});setTimeout(function(){document.body.classList.add("slow")},${SLOW_AFTER_MS})})()</script>`
    : "";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${live ? `Te llevamos a ${name}` : `Cupón de ${name}`} · CuponLab</title>
${jump}
<style>${CSS}</style>
</head>
<body>
<a class="top" href="/">${LOGO}<span>Cupon<b>Lab</b></span></a>
<main class="mid${live && i.code ? " has-steps" : ""}">
${live ? liveCard(i, href) : expiredCard(i, href)}
${live && i.code ? STEPS(name) : ""}
</main>
<p class="fine">Enlace de afiliado. Si compras, CuponLab puede cobrar una comisión. Tú pagas lo mismo.</p>
</body>
</html>`;
}
