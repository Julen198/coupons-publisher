import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeInSentence, conditionsOf, dedupeDeals, displayTitle, lowerFirst, mentionsBadge, storeHeading } from "./deal-text.ts";

test("conditionsOf splits a description into short reader-facing bullets", () => {
  assert.deepEqual(conditionsOf("No válido en lanzamientos. Pedido mínimo 50 €."), ["No válido en lanzamientos", "Pedido mínimo 50 €"]);
  assert.deepEqual(conditionsOf("Envío gratis; solo nuevos clientes\nUn uso por persona"), ["Envío gratis", "solo nuevos clientes", "Un uso por persona"]);
  assert.deepEqual(conditionsOf(""), []);
});

test("conditionsOf drops research and editor notes", () => {
  const notes = [
    "no consta fecha de caducidad ni que siga activa hoy",
    "válida hasta el 31/01/2027 según la fuente",
    "según noticia de Europa Press",
    "Según Europa Press la oferta sigue",
    "sin código ni condiciones detalladas en el resultado",
    "no se indica explícitamente que sea solo para España en la fuente",
    "Sin fecha de fin indicada",
    "Fuente: web de la tienda",
    "graphics: https://drive.google.com/drive/folders/1mjrH70wBXx9ibPNXHv",
    "Más info en www.tienda.es/condiciones",
    "creatividades en drive.google.com/abc",
  ];
  assert.deepEqual(conditionsOf(`Pedido mínimo 30 €. ${notes.join(". ")}. Solo en la web`), ["Pedido mínimo 30 €", "Solo en la web"]);
});

test("conditionsOf drops a bullet that repeats the title", () => {
  assert.deepEqual(conditionsOf("Fino al -60 % su Fila", "Fino al -60 % su Fila"), []);
  assert.deepEqual(conditionsOf("Replay, los reacondicionados de PcComponentes.", "replay, los reacondicionados de pccomponentes"), []);
  // the title already says it in full
  assert.deepEqual(conditionsOf("Envío gratis. Pedido mínimo 20 €", "20% y envío gratis en todo"), ["Pedido mínimo 20 €"]);
  assert.deepEqual(conditionsOf("Pedido mínimo 20 €", "20% en todo"), ["Pedido mínimo 20 €"]);
});

test("displayTitle sentence-cases titles written in capitals", () => {
  assert.equal(displayTitle("ATÉ 60 % DE DESCONTO EM ARTIGOS DA REEBOK", "JD Sports PT"), "Até 60 % de desconto em artigos da reebok");
  assert.equal(displayTitle("SINGLES' DAY BIS ZU -50% AUF ALLES", "eschuhe"), "Singles' day bis zu -50% auf alles");
  // codes and figures keep their capitals; the store keeps its own spelling
  assert.equal(displayTitle("20% EXTRA EN ZOOPLUS CON WELCOME20", "zooplus"), "20% extra en zooplus con WELCOME20");
  assert.equal(displayTitle("Ofertas Flash New Balance", "Deporvillage"), "Ofertas Flash New Balance");
  assert.equal(displayTitle("ASMAX15", "Asos"), "ASMAX15");
});

test("displayTitle drops the store name in front and turns pipes into dots", () => {
  assert.equal(displayTitle("Worten: hasta 90% en televisores", "Worten"), "Hasta 90% en televisores");
  assert.equal(displayTitle("Deporvillage - hasta 71% en ciclismo", "Deporvillage"), "Hasta 71% en ciclismo");
  assert.equal(displayTitle("costa cruceros: oferta de otoño", "Costa Cruceros"), "Oferta de otoño");
  assert.equal(displayTitle("Ofertas Flash New Balance. Exclusivo online | Deportes", "Deporvillage"), "Ofertas Flash New Balance. Exclusivo online · Deportes");
  assert.equal(displayTitle("Prepara tu piso para alquilar | PcComponentes", "PcComponentes"), "Prepara tu piso para alquilar");
  // nothing left after the store name: keep the title as it is
  assert.equal(displayTitle("Worten:", "Worten"), "Worten:");
  assert.equal(displayTitle("  Worten   Black   Friday ", "Worten"), "Worten Black Friday");
});

test("dedupeDeals keeps one deal per store and title: the verified one, then the newest", () => {
  const deals = [
    { id: 1, store_id: 7, title: "Fino al -60 % su Scarpe Donna", verified: 0 },
    { id: 2, store_id: 7, title: "Fino al -60% su scarpe donna", verified: 1 },
    { id: 3, store_id: 7, title: "Fino al -60 % su Scarpe Donna", verified: 1 },
    { id: 4, store_id: 8, title: "Fino al -60 % su Scarpe Donna", verified: 0 },
    { id: 5, store_id: 7, title: "Otro chollo", verified: 0 },
  ];
  assert.deepEqual(dedupeDeals(deals).map((d) => d.id), [3, 4, 5]);
  assert.deepEqual(dedupeDeals([]), []);
});

test("lowerFirst lowercases only the first letter, and leaves acronyms alone", () => {
  assert.equal(lowerFirst("Válido en comida húmeda Pro Plan"), "válido en comida húmeda Pro Plan");
  assert.equal(lowerFirst("PS5 y Xbox"), "PS5 y Xbox");
  assert.equal(lowerFirst("IVA incluido"), "IVA incluido");
  assert.equal(lowerFirst(""), "");
});

test("mentionsBadge tells when the title already shows the discount", () => {
  assert.equal(mentionsBadge("20% en Hill's Science Plan", "20 %"), true);
  assert.equal(mentionsBadge("Hasta 50 % en moda", "Hasta 50 %"), true);
  assert.equal(mentionsBadge("Rebajas en moda", "50 %"), false);
  assert.equal(mentionsBadge("Rebajas en moda", "Oferta"), false);
});

test("storeHeading promises codes only when the store has them", () => {
  const now = new Date(2026, 10, 5);
  const deal = (discount: string) => ({ kind: "deal" as const, code: "", discount });
  const code = (discount: string, c = "X") => ({ kind: "code" as const, code: c, discount });
  // percentages first, then amounts, biggest first; two at most
  assert.equal(storeHeading("PcComponentes", [deal("50€"), deal("320 €"), deal("20%")], now), "Ofertas PcComponentes 20 % y 320 €, noviembre 2026");
  assert.equal(storeHeading("PcComponentes", [deal("50€"), deal("320 €")], now), "Ofertas PcComponentes 320 € y 50 €, noviembre 2026");
  assert.equal(storeHeading("zooplus", [deal("50%"), code("15%"), code("15 %"), code("5€")], now), "Códigos descuento zooplus 15 % y 5 €, noviembre 2026");
  // the same figure once, the flat one before its "hasta"
  assert.equal(storeHeading("Worten", [deal("Hasta 90%"), deal("hasta 90 %"), deal("90%")], now), "Ofertas Worten 90 %, noviembre 2026");
  assert.equal(storeHeading("Worten", [deal("Hasta 90%"), deal("20%")], now), "Ofertas Worten hasta 90 % y 20 %, noviembre 2026");
  // a "code" without the code itself is not a code
  assert.equal(storeHeading("Shein", [code("10%", "")], now), "Ofertas Shein 10 %, noviembre 2026");
  assert.equal(storeHeading("Shein", [], now), "Ofertas Shein, noviembre 2026");
});

test("badgeInSentence lowercases «hasta» inside a sentence", () => {
  assert.equal(badgeInSentence("Hasta 90 %"), "hasta 90 %");
  assert.equal(badgeInSentence("20 %"), "20 %");
  assert.equal(badgeInSentence("Envío gratis"), "envío gratis");
  assert.equal(badgeInSentence("2x1"), "2x1");
});

test("displayTitle keeps brand spellings like iPhone and eBay after cutting the store prefix", () => {
  assert.equal(displayTitle("Worten: iPhone 15 a mitad de precio", "Worten"), "iPhone 15 a mitad de precio");
  assert.equal(displayTitle("Worten: eBay y iPad en oferta", "Worten"), "eBay y iPad en oferta");
  assert.equal(displayTitle("eBay: 10 % en todo", "eBay"), "10 % en todo");
  assert.equal(displayTitle("Worten: ofertas en tele", "Worten"), "Ofertas en tele");
});

test("displayTitle restores the store name only as a whole word in a shouting title", () => {
  assert.equal(displayTitle("CAMISETAS DE MONTAÑA ON", "On"), "Camisetas de montaña On");
});

test("displayTitle keeps short acronyms in capitals inside a shouting title", () => {
  assert.equal(displayTitle("TV LG OLED -30%", "Worten"), "TV LG OLED -30%");
  assert.equal(displayTitle("OFERTAS EN TV Y SSD CON USB", "Worten"), "Ofertas en TV y SSD con USB");
});

test("dedupeDeals keeps coupons with the same title but different codes", () => {
  const deals = [
    { id: 1, store_id: 7, title: "10 % en todo", code: "AAA", verified: 0 },
    { id: 2, store_id: 7, title: "10 % en todo", code: "bbb", verified: 0 },
    { id: 3, store_id: 7, title: "10 % en todo", code: " aaa ", verified: 1 },
  ];
  assert.deepEqual(dedupeDeals(deals).map((d) => d.id), [2, 3]);
});

test("displayTitle lowercases every shouting word except known acronyms", () => {
  assert.equal(displayTitle("ZAPATILLAS NIKE PARA HOMBRE", "Worten"), "Zapatillas nike para hombre");
  assert.equal(displayTitle("PRECIOS MUY BAJOS HOY", "Worten"), "Precios muy bajos hoy");
  assert.equal(displayTitle("COMPRA TUS GAFAS AHORA", "Worten"), "Compra tus gafas ahora");
  assert.equal(displayTitle("TUTTO A META PREZZO", "Worten"), "Tutto a meta prezzo");
});
