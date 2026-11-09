import { test } from "node:test";
import assert from "node:assert/strict";
import { weeklyReport, type ReportInput } from "./weekly-report.ts";

const totals = (over: Partial<ReportInput["cur"]> = {}): ReportInput["cur"] => ({
  impressions: 0, gClicks: 0, position: null, visits: 0, clicks: 0, copies: 0, earned: 0, sales: 0, ...over,
});

const base: ReportInput = {
  range: { start: "2026-11-09", end: "2026-11-15" },
  cur: totals({ impressions: 1200, gClicks: 30, position: 24.6, visits: 210, clicks: 41, copies: 12, earned: 7.5, sales: 2 }),
  prev: totals({ impressions: 800, gClicks: 20, position: 31.2, visits: 150, clicks: 41, copies: 10, earned: 0, sales: 0 }),
  guides: [
    { name: "Aosom", impressions: 640, position: 14.1, clicks: 9, earned: 2.5 },
    { name: "Atmosfera Sport", impressions: 0, position: null, clicks: 0, earned: 0 },
  ],
  nearQueries: [{ query: "código descuento aosom", position: 14.1, impressions: 380 }],
  site: "https://www.cuponlab.com",
};

test("weeklyReport: the week's numbers against the one before, every guide, and the searches within reach", () => {
  assert.equal(weeklyReport(base), [
    "📊 Semana del 9 al 15 nov",
    "",
    "Google: 1200 impresiones (▲ 50 %), 30 clics (▲ 50 %), posición media 24,6 (▲ 6,6 puestos)",
    "Web: 210 visitas (▲ 40 %)",
    "Tiendas: 41 clics (= igual), 12 códigos copiados (▲ 20 %)",
    "Comisiones: 7,50 € en 2 ventas",
    "",
    "Guías SEO:",
    "• Aosom: 640 impresiones, posición 14,1, 9 clics, 2,50 €",
    "• Atmosfera Sport: sin impresiones todavía",
    "",
    "A punto de subir (posición 8–30):",
    "• «código descuento aosom»: posición 14,1, 380 impresiones",
    "",
    "Detalle: https://www.cuponlab.com/panel/estadisticas?dias=7",
  ].join("\n"));
});

test("weeklyReport: a first week without Google data or sales stays short and honest", () => {
  const text = weeklyReport({ ...base, cur: totals({ clicks: 3 }), prev: totals(), guides: [], nearQueries: [] });
  assert.match(text, /Google: sin datos todavía/);
  assert.match(text, /Tiendas: 3 clics \(nuevo\)/);
  assert.match(text, /Comisiones: ninguna esta semana/);
  assert.doesNotMatch(text, /Guías SEO|A punto de subir/);
});
