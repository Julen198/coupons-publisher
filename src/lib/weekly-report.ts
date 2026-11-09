// The Monday report for the admin chat: last week against the one before, every guide and the searches within reach.
// Pure text; the Telegram cron feeds it from loadStats(7).

export interface ReportTotals { impressions: number; gClicks: number; position: number | null; visits: number | null; clicks: number; copies: number; earned: number; sales: number }
export interface ReportInput {
  range: { start: string; end: string };
  cur: ReportTotals; prev: ReportTotals;
  guides: { name: string; impressions: number; position: number | null; clicks: number; earned: number }[];
  nearQueries: { query: string; position: number; impressions: number }[];
  site: string;
}

const n = (v: number) => Math.round(v).toLocaleString("es-ES");
const dec = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 });
const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function change(cur: number, prev: number): string {
  if (!prev) return cur ? "nuevo" : "= igual";
  const p = Math.round(((cur - prev) / prev) * 100);
  return p === 0 ? "= igual" : `${p > 0 ? "▲" : "▼"} ${Math.abs(p)} %`;
}

// position: lower is better, so a smaller number is ▲
function positionChange(cur: number, prev: number | null): string {
  if (prev == null) return "nueva";
  const d = prev - cur;
  return Math.abs(d) < 0.05 ? "= igual" : `${d > 0 ? "▲" : "▼"} ${dec(Math.abs(d))} puestos`;
}

function days(start: string, end: string): string {
  const f = (iso: string, month: boolean) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", ...(month ? { month: "short" } : {}), timeZone: "UTC" });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${f(start, !sameMonth)} al ${f(end, true)}`.replace(/\./g, "");
}

export function weeklyReport(x: ReportInput): string {
  const { cur, prev } = x;
  const google = cur.impressions
    ? `Google: ${n(cur.impressions)} impresiones (${change(cur.impressions, prev.impressions)}), ${n(cur.gClicks)} clics (${change(cur.gClicks, prev.gClicks)})` +
      (cur.position != null ? `, posición media ${dec(cur.position)} (${positionChange(cur.position, prev.position)})` : "")
    : "Google: sin datos todavía";
  const web = cur.visits == null ? "Web: sin datos de GA4" : `Web: ${n(cur.visits)} visitas (${change(cur.visits, prev.visits ?? 0)})`;
  const lines = [
    `📊 Semana del ${days(x.range.start, x.range.end)}`,
    "",
    google,
    web,
    `Tiendas: ${n(cur.clicks)} clics (${change(cur.clicks, prev.clicks)}), ${n(cur.copies)} códigos copiados (${change(cur.copies, prev.copies)})`,
    cur.sales ? `Comisiones: ${eur(cur.earned)} en ${cur.sales} ${cur.sales === 1 ? "venta" : "ventas"}` : "Comisiones: ninguna esta semana",
  ];
  if (x.guides.length) {
    lines.push("", "Guías SEO:", ...x.guides.map((g) =>
      g.impressions
        ? `• ${g.name}: ${n(g.impressions)} impresiones, posición ${g.position == null ? "—" : dec(g.position)}, ${n(g.clicks)} clics${g.earned ? `, ${eur(g.earned)}` : ""}`
        : `• ${g.name}: sin impresiones todavía`));
  }
  if (x.nearQueries.length) {
    lines.push("", "A punto de subir (posición 8–30):", ...x.nearQueries.map((q) => `• «${q.query}»: posición ${dec(q.position)}, ${n(q.impressions)} impresiones`));
  }
  lines.push("", `Detalle: ${x.site}/panel/estadisticas?dias=7`);
  return lines.join("\n");
}
