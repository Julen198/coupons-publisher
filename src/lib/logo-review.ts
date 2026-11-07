// scripts/refresh-logos.ts helpers, pure: its arguments, reading a stored logo, and the review page it writes
import { imageSize, sniffImageType } from "./image-size.ts";

export interface RefreshArgs {
  apply: boolean;
  only: string[];
  force: boolean; // with --only: replace even when the proposal isn't bigger
  from: string; // with one --only store: take the logo from this image URL instead of searching
  file: string; // with one --only store: take the logo from this local file (a site that blocks bots; downloaded by hand)
  out: string;
  clear: boolean; // with --only: remove the stored logo, so the site shows the store's initials
  wordmarks: boolean; // work on wordmark_data (the logo with the name, landscape boxes) instead of the square icon
}

export function parseRefreshArgs(argv: readonly string[]): RefreshArgs {
  const args: RefreshArgs = { apply: false, only: [], force: false, from: "", file: "", out: "", clear: false, wordmarks: false };
  for (const a of argv) {
    const [flag, ...rest] = a.split("=");
    const value = rest.join("=");
    if (a === "--apply") args.apply = true;
    else if (a === "--force") args.force = true;
    else if (a === "--clear") args.clear = true;
    else if (a === "--wordmarks") args.wordmarks = true;
    else if (flag === "--only") args.only = value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (flag === "--from") args.from = value.trim();
    else if (flag === "--file") args.file = value.trim();
    else if (flag === "--out") args.out = value.trim();
    else throw new Error(`Opción desconocida: ${a}`);
  }
  if (args.force && !args.only.length) throw new Error("--force solo vale junto a --only=<slugs>");
  if (args.clear && !args.only.length) throw new Error("--clear solo vale junto a --only=<slugs>");
  if (args.from && args.only.length !== 1) throw new Error("--from necesita --only con una sola tienda (one store)");
  if (args.file && args.only.length !== 1) throw new Error("--file necesita --only con una sola tienda (one store)");
  return args;
}

export interface LogoInfo {
  type: string;
  width: number;
  height: number;
  bytes: number;
}

const DATA_URI = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

// A stored logo_data's real format and size, or null when empty / not an image we can read
export function logoDataInfo(dataUri: string): LogoInfo | null {
  const m = DATA_URI.exec(dataUri);
  if (!m) return null;
  const bytes = Buffer.from(m[2], "base64");
  const type = sniffImageType(bytes) || m[1];
  const size = imageSize(bytes, type);
  return size ? { type, ...size, bytes: bytes.length } : null;
}

export interface ReviewRow {
  name: string;
  slug: string;
  current: { dataUri: string; info: LogoInfo | null };
  proposed: (LogoInfo & { dataUri: string; source: string; url: string }) | null;
  willUpdate: boolean;
  tried: readonly { url: string; source: string; result: string }[];
  error?: string;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ESC[ch]);
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const describe = (i: LogoInfo | null) => (i ? `${Math.round(i.width)}×${Math.round(i.height)} · ${i.type.replace("image/", "")} · ${kb(i.bytes)}` : "—");

// The logo as the site shows it: in a 112px deal tile (64% box) and an 18px header icon
function tiles(dataUri: string, kind: ReviewKind): string {
  if (kind === "wordmark") return wordmarkBoxes(dataUri);
  if (!DATA_URI.test(dataUri)) return `<div class="tile big none">sin logo</div><div class="tile small none"></div>`;
  const src = esc(dataUri);
  return `<div class="tile big"><img src="${src}" alt=""></div><div class="tile small"><img src="${src}" alt=""></div>`;
}

// The wordmark as the site shows it: a /tiendas card box and the store page hero box (white, logo contained)
function wordmarkBoxes(dataUri: string): string {
  if (!DATA_URI.test(dataUri)) return `<div class="wm card none">sin wordmark</div>`;
  const src = esc(dataUri);
  return `<div class="wm card"><img src="${src}" alt=""></div><div class="wm hero"><img src="${src}" alt=""></div>`;
}

function row(r: ReviewRow, kind: ReviewKind): string {
  const p = r.proposed;
  const status = r.error ? `error: ${esc(r.error)}` : r.willUpdate ? "se actualizará" : p ? "se queda (no es mayor)" : "sin propuesta";
  const tried = r.tried.map((t) => `<li><b>${esc(t.source)}</b> ${esc(t.result)} <span class="url">${esc(t.url)}</span></li>`).join("");
  return `<tr class="${r.willUpdate ? "upd" : ""}">
<td><strong>${esc(r.name)}</strong><br><code>${esc(r.slug)}</code><br><span class="st">${status}</span></td>
<td><div class="pair">${tiles(r.current.dataUri, kind)}</div><div class="meta">${describe(r.current.info)}</div></td>
<td><div class="pair">${tiles(p?.dataUri ?? "", kind)}</div><div class="meta">${p ? `${esc(p.source)} · ${describe(p)}<br><span class="url">${esc(p.url)}</span>` : "—"}</div>
${tried ? `<details><summary>${r.tried.length} intentos</summary><ul>${tried}</ul></details>` : ""}</td>
</tr>`;
}

export type ReviewKind = "icon" | "wordmark";

export function renderLogoReview(rows: readonly ReviewRow[], o: { apply: boolean; generatedAt: string; kind?: ReviewKind }): string {
  const kind = o.kind ?? "icon";
  const updates = rows.filter((r) => r.willUpdate).length;
  const what = kind === "wordmark" ? "wordmarks" : "logos";
  const boxes = kind === "wordmark" ? "120×50 y 240×100" : "112 px y 16 px";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revisión de ${what}</title>
<style>
:root { color-scheme: light; --line: #d9dce3; --ink: #141a2b; --muted: #5b6275; --hl: #eef7ee; }
body { margin: 0; padding: 24px 16px; font: 14px/1.45 system-ui, sans-serif; color: var(--ink); background: #f6f7f9; }
h1 { font-size: 20px; margin: 0 0 4px; } p { color: var(--muted); margin: 0 0 16px; }
table { border-collapse: collapse; width: 100%; background: #fff; }
td, th { border-bottom: 1px solid var(--line); padding: 12px; text-align: left; vertical-align: top; }
tr.upd td { background: var(--hl); }
.pair { display: flex; gap: 16px; align-items: center; }
.tile { background: #fff; border: 1px solid var(--line); display: grid; place-items: center; overflow: hidden; color: var(--muted); font-size: 11px; }
.tile.big { width: 112px; height: 112px; border-radius: 4px; } .tile.big img { width: 64%; height: 64%; object-fit: contain; }
.tile.small { width: 18px; height: 18px; border-radius: 4px; } .tile.small img { width: 100%; height: 100%; object-fit: contain; }
.meta { margin-top: 6px; color: var(--muted); font-size: 12px; } .url { color: var(--muted); font-size: 11px; word-break: break-all; }
.st { font-size: 12px; color: var(--muted); } tr.upd .st { color: #1d6b2a; font-weight: 600; }
.wm { background: #fff; border: 1px solid var(--line); border-radius: 6px; display: grid; place-items: center; overflow: hidden; color: var(--muted); font-size: 11px; box-sizing: border-box; }
.wm.card { width: 120px; height: 50px; padding: 6px 10px; } .wm.hero { width: 240px; height: 100px; padding: 12px 20px; }
.wm img { width: 100%; height: 100%; object-fit: contain; }
details { margin-top: 6px; font-size: 12px; } ul { margin: 4px 0 0; padding-left: 18px; }
</style></head><body>
<h1>Revisión de ${what} de tiendas</h1>
<p>${esc(o.generatedAt)} · ${rows.length} tiendas · ${updates} con ${kind === "wordmark" ? "un wordmark nuevo o mejor" : "un logo mejor (mayor)"} · ${o.apply ? "aplicado (--apply)" : "simulación: no se ha cambiado nada"}</p>
<table><thead><tr><th>Tienda</th><th>Actual (${boxes})</th><th>Propuesto (${boxes})</th></tr></thead><tbody>
${rows.map((r) => row(r, kind)).join("\n")}
</tbody></table></body></html>
`;
}
