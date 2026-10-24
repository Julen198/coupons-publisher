import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFoundCoupons } from "./coupon-finder.ts";

test("web finds are cleaned: valid codes, no expired, no duplicates, max 8", () => {
  const raw = [
    { title: " 10% en tu primer pedido ", code: "hola10", discount: "10%", description: "Nuevos clientes", expires: "2026-12-31", sourceUrl: "https://cupones.es/temu" },
    { title: "Rebajas hasta -50%", code: "", discount: "50%", description: "", expires: "", sourceUrl: "nope" },
    { title: "Caducado", code: "OLD5", discount: "5€", description: "", expires: "2026-01-01", sourceUrl: "" },
    { title: "Código raro", code: "ver código en la web", discount: "", description: "", expires: "mañana", sourceUrl: "" },
    { title: "Ya lo tenemos", code: "YA20", discount: "20%", description: "", expires: "", sourceUrl: "" },
    { title: "10% en tu primer pedido", code: "HOLA10", discount: "10%", description: "", expires: "", sourceUrl: "" },
  ];
  const out = cleanFoundCoupons(raw, "2026-10-24", [{ title: "Ya lo tenemos", code: "YA20" }]);
  assert.deepEqual(out, [
    { kind: "code", title: "10% en tu primer pedido", code: "HOLA10", discount: "10%", description: "Nuevos clientes", expires_at: "2026-12-31", source_url: "https://cupones.es/temu" },
    { kind: "deal", title: "Rebajas hasta -50%", code: "", discount: "50%", description: "", expires_at: "", source_url: "" },
    { kind: "deal", title: "Código raro", code: "", discount: "", description: "", expires_at: "", source_url: "" },
  ]);
  assert.equal(cleanFoundCoupons(Array.from({ length: 12 }, (_, i) => ({ ...raw[1], title: `Oferta ${i}` })), "2026-10-24", []).length, 8);
});
