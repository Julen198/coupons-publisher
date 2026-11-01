import { test } from "node:test";
import assert from "node:assert/strict";
import { mapStoreLines } from "./store-import.ts";

test("pasted store lines: any separator, any order, name from the domain", () => {
  const { stores, errors, rejected } = mapStoreLines(
    [
      "Nombre;Web;Merchant ID", // header row is skipped
      "Decathlon, https://www.decathlon.es, 1234",
      "zalando.es\t5678", // Excel paste, no name
      "17001; El Corte Inglés; elcorteingles.es/ofertas",
      "",
      "Sin web",
      "Decathlon España; decathlon.es", // same slug as line 2 → duplicate
    ].join("\n"),
  );
  assert.deepEqual(stores, [
    { name: "Decathlon", slug: "decathlon", website: "https://www.decathlon.es", merchant_id: "1234" },
    { name: "Zalando", slug: "zalando", website: "https://zalando.es", merchant_id: "5678" },
    { name: "El Corte Inglés", slug: "el-corte-ingles", website: "https://elcorteingles.es/ofertas", merchant_id: "17001" },
  ]);
  assert.deepEqual(rejected, ["Sin web", "Decathlon España; decathlon.es"]);
  assert.deepEqual(errors, ["Línea 6: falta la web (p. ej. sinweb.es)", "Línea 7: «Decathlon España» repite una tienda de la lista"]);
});

test("a name that looks like a domain stays the name when a real URL is on the line", () => {
  const { stores } = mapStoreLines("Booking.com\thttps://www.booking.com\nHoteles.com, https://es.hotels.com\nTrip.com");
  assert.deepEqual(stores.map((s) => [s.name, s.website, s.slug]), [
    ["Booking.com", "https://www.booking.com", "booking-com"],
    ["Hoteles.com", "https://es.hotels.com", "hoteles-com"],
    ["Trip", "https://Trip.com", "trip"],
  ]);
});
