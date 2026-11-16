// Evergreen landing pages for the shopping dates of the calendar (/ofertas/<slug>): one URL per event that keeps its
// rankings from one year to the next («ofertas black friday», «rebajas de enero»…). The text is hand-written and true
// every year; the date, the countdown and the deals are worked out per request. Pure, so it tests without a database.
import type { CategorySlug } from "./catalog.ts";
import { isPerk } from "./perks.ts";
import { eventsOf } from "./site-text.ts";

export interface EventPage {
  slug: string;
  name: string; // "Black Friday", as the calendar names it (without the year)
  // the calendar entry this page is about (eventsOf names Black Friday with its year)
  calendarName: (year: number) => string;
  // days after its date that the page still talks about this year's edition (the rebajas last weeks)
  lastsDays: number;
  // a deal belongs to the event when its title or description says so
  match: RegExp;
  // a word like «rebajas» is used all year: count it only around the date
  matchOnlyInSeason?: boolean;
  categories: readonly CategorySlug[]; // where to look while no deal mentions the event ([] = everywhere)
  what: string; // one line for the meta description: what people buy
  lead: (when: string, year: number) => string;
  sections: { heading: string; paragraphs: string[] }[];
  tips: string[];
  faqs: (when: string, year: number) => { q: string; a: string }[];
}

export const RETURNS =
  "Las compras online en España tienen 14 días naturales de desistimiento desde que recibes el pedido, salvo excepciones como productos personalizados o precintados que se han abierto. Algunas tiendas amplían ese plazo en campañas; revisa sus condiciones antes de pagar.";
const OMNIBUS =
  "Desde 2022, cuando una tienda anuncia una rebaja tiene que tomar como precio anterior el más bajo que aplicó en los 30 días previos. Si un «antes» te parece inflado, desconfía y compara en otras tiendas.";

export const EVENT_PAGES: readonly EventPage[] = [
  {
    slug: "black-friday",
    name: "Black Friday",
    calendarName: (y) => `Black Friday ${y}`,
    lastsDays: 3,
    match: /black\s*-?\s*friday|blackfriday|black\s*week|semana\s+negra|viernes\s+negro/i,
    categories: [],
    what: "tecnología, moda, zapatillas, hogar y deporte",
    lead: (when, y) =>
      `El Black Friday ${y} es el ${when}. Es el día de más descuentos del año en las tiendas online españolas y muchas empiezan sus ofertas una semana antes, en la llamada Black Week. Aquí reunimos los chollos y códigos descuento de Black Friday activos, cada uno con su fecha de caducidad y si está comprobado.`,
    sections: [
      {
        heading: "Cuándo es y cuánto dura",
        paragraphs: [
          "El Black Friday cae el viernes siguiente al Día de Acción de Gracias de Estados Unidos, el cuarto jueves de noviembre. En España se ha convertido en una campaña de varios días: muchas tiendas abren las ofertas el lunes anterior y las alargan hasta el Cyber Monday, el lunes siguiente.",
          "Algunas tiendas dan acceso anticipado a quien está suscrito a su newsletter o tiene cuenta, así que conviene registrarse en las que te interesan unos días antes.",
        ],
      },
      {
        heading: "Cómo saber si una oferta merece la pena",
        paragraphs: [OMNIBUS, "Los códigos descuento de Black Friday suelen tener condiciones: compra mínima, solo en ciertas categorías o un uso por cliente. En cada chollo de CuponLab verás esas condiciones y hasta cuándo vale."],
      },
    ],
    tips: [
      "Haz una lista de lo que necesitas antes de que empiecen las ofertas y apunta su precio actual.",
      "Mira si el código se puede sumar a productos ya rebajados: casi siempre se aplica sobre el precio rebajado.",
      "Revisa el coste de envío y el plazo: con el volumen de pedidos de esa semana, las entregas tardan más.",
      "Si es un regalo de Navidad, comprueba hasta cuándo puedes devolverlo.",
    ],
    faqs: (when, y) => [
      { q: `¿Cuándo es el Black Friday ${y}?`, a: `El ${when}. El Cyber Monday es el lunes siguiente y muchas tiendas empiezan las ofertas la semana anterior.` },
      { q: "¿Los códigos descuento funcionan con productos rebajados de Black Friday?", a: "Depende de cada tienda. Muchos códigos se aplican sobre el precio ya rebajado, pero algunos excluyen artículos en oferta. Las condiciones de cada chollo lo indican." },
      { q: "¿Puedo devolver lo que compre en Black Friday?", a: RETURNS },
    ],
  },
  {
    slug: "cyber-monday",
    name: "Cyber Monday",
    calendarName: () => "Cyber Monday",
    lastsDays: 1,
    match: /cyber\s*-?\s*monday|cybermonday|ciber\s*lunes|cyber\s*week/i,
    categories: ["tecnologia"],
    what: "tecnología, informática y electrónica",
    lead: (when, y) =>
      `El Cyber Monday ${y} es el ${when}, el lunes siguiente al Black Friday. Nació como el día de las compras online y en España se centra sobre todo en tecnología. Aquí tienes los chollos y códigos de Cyber Monday activos, con su fecha de caducidad.`,
    sections: [
      {
        heading: "Qué diferencia hay con el Black Friday",
        paragraphs: [
          "Hoy casi todas las ofertas de Black Friday también son online, así que la diferencia es más de calendario que de canal. El Cyber Monday cierra la semana de descuentos: algunas tiendas renuevan las ofertas que se agotaron y otras lanzan códigos solo para ese día.",
          OMNIBUS,
        ],
      },
    ],
    tips: [
      "Si algo se agotó en Black Friday, vuelve a mirarlo el lunes: a veces repone stock con el mismo precio.",
      "Los códigos de Cyber Monday suelen durar 24 horas; mira la fecha de caducidad de cada uno.",
      "En tecnología compara el modelo exacto: una referencia distinta puede explicar un precio más bajo.",
    ],
    faqs: (when, y) => [
      { q: `¿Cuándo es el Cyber Monday ${y}?`, a: `El ${when}, tres días después del Black Friday.` },
      { q: "¿Qué tiendas tienen ofertas en Cyber Monday?", a: "Sobre todo las de tecnología y electrónica, aunque muchas tiendas de moda y hogar mantienen sus ofertas de Black Friday hasta ese día." },
      { q: "¿Puedo devolver lo que compre en Cyber Monday?", a: RETURNS },
    ],
  },
  {
    slug: "dia-del-soltero",
    name: "Día del Soltero",
    calendarName: () => "Día del Soltero",
    lastsDays: 0,
    match: /singles'?\s*day|d[ií]a\s+del\s+soltero|\b11\.11\b|double\s*11/i,
    categories: ["tecnologia", "moda"],
    what: "tecnología, moda y artículos de AliExpress",
    lead: (when, y) =>
      `El Día del Soltero ${y} (Singles' Day u 11.11) es el ${when}. Empezó en China y en España lo han popularizado AliExpress y otras tiendas de tecnología y moda. Aquí reunimos los chollos y códigos de esa fecha activos ahora.`,
    sections: [
      {
        heading: "Qué es el 11.11",
        paragraphs: [
          "El 11 de noviembre se celebra en China el día de los solteros por los cuatro unos de la fecha. Se ha convertido en la mayor jornada de compras online del mundo y llega a España a través de las tiendas que venden productos importados.",
          "Los descuentos suelen combinar cupones de la propia tienda, cupones del vendedor y códigos promocionales. Revisa el plazo de entrega: si el envío sale de fuera de la UE puede tardar varias semanas.",
        ],
      },
    ],
    tips: [
      "Comprueba si el producto se envía desde un almacén en Europa: llega antes y evita costes de aduana.",
      "Guarda los productos en el carrito antes del día para ver el precio real cuando empiece la oferta.",
      "Mira las valoraciones del vendedor, no solo las del producto.",
    ],
    faqs: (when, y) => [
      { q: `¿Cuándo es el Día del Soltero ${y}?`, a: `El ${when}. Algunas tiendas empiezan las ofertas unos días antes.` },
      { q: "¿Es lo mismo que el Black Friday?", a: "No. El Día del Soltero es el 11 de noviembre y el Black Friday llega dos semanas después. Hay tiendas que hacen campaña en las dos fechas." },
    ],
  },
  {
    slug: "navidad",
    name: "Navidad",
    calendarName: () => "Navidad",
    lastsDays: 12, // hasta Reyes
    match: /navidad|navide[ñn]|christmas|xmas|reyes\s+magos|\breyes\b/i,
    categories: [],
    what: "regalos de tecnología, moda, juguetes y hogar",
    lead: (when, y) =>
      `Navidad ${y} es el ${when} y Reyes, el 6 de enero. Son las semanas en que más regalos se compran online, así que lo que más importa no es solo el descuento sino que el pedido llegue a tiempo. Aquí tienes los chollos y códigos descuento para regalos activos hoy.`,
    sections: [
      {
        heading: "Cuándo comprar para que llegue a tiempo",
        paragraphs: [
          "Cada tienda publica su último día de pedido para entregar antes de Nochebuena y de Reyes. Suele estar entre el 18 y el 22 de diciembre para Navidad y alrededor del 2 o 3 de enero para Reyes, pero cambia mucho según el transportista y el destino. Revísalo en la web de la tienda antes de pagar.",
          "Si te pilla el toro, busca tiendas con recogida en tienda o entrega en 24 horas, y deja los envíos desde fuera de la UE para otra ocasión.",
        ],
      },
      { heading: "Devoluciones de regalos", paragraphs: [RETURNS, "Pide ticket regalo cuando la tienda lo ofrezca: la persona que lo recibe podrá cambiarlo sin enseñar el precio."] },
    ],
    tips: [
      "Aprovecha el Black Friday y el Cyber Monday para adelantar regalos y revisa hasta cuándo se pueden devolver.",
      "Apunta el último día de envío de cada tienda en la que vayas a comprar.",
      "Mira si el código tiene compra mínima: juntar varios regalos en un pedido puede compensar.",
    ],
    faqs: (when, y) => [
      { q: `¿Hasta cuándo puedo pedir online para que llegue antes de Navidad ${y}?`, a: "Depende de cada tienda y transportista; la mayoría fija un último día entre el 18 y el 22 de diciembre. Lo indican en su web, normalmente en la página de envíos." },
      { q: "¿Qué pasa si quiero devolver un regalo?", a: RETURNS },
      { q: "¿Las rebajas empiezan después de Reyes?", a: "Sí, las rebajas de invierno empiezan tradicionalmente el 7 de enero, aunque muchas tiendas las adelantan en su web." },
    ],
  },
  {
    slug: "rebajas-de-enero",
    name: "Rebajas de enero",
    calendarName: () => "Rebajas de enero",
    lastsDays: 55,
    match: /rebajas|winter\s+sales?|\bsales?\b/i,
    matchOnlyInSeason: true,
    categories: ["moda", "zapatillas", "hogar"],
    what: "moda, zapatillas y hogar",
    lead: (when, y) =>
      `Las rebajas de enero ${y} empiezan el ${when}, el día después de Reyes, en casi todas las tiendas de moda y hogar, y duran hasta finales de febrero o principios de marzo. Aquí tienes los chollos y códigos de rebajas activos hoy, con su fecha de caducidad.`,
    sections: [
      {
        heading: "Cuándo empiezan y cuánto duran",
        paragraphs: [
          "Desde 2012 cada tienda en España puede elegir cuándo hace rebajas, pero la mayoría mantiene la fecha tradicional del 7 de enero. Muchas las adelantan en su web o para clientes registrados, a veces desde el mismo día de Reyes por la tarde.",
          "Las rebajas suelen llegar en oleadas: primero un descuento moderado y, a partir de la segunda o tercera semana, segundas rebajas con porcentajes más altos y menos tallas.",
        ],
      },
      { heading: "Rebajas de verdad", paragraphs: [OMNIBUS] },
    ],
    tips: [
      "Si buscas una talla concreta, compra en los primeros días: luego bajan los precios pero también el stock.",
      "Los códigos de bienvenida o de newsletter a veces se suman a la rebaja; mira las condiciones.",
      "Revisa si la tienda cambia la política de devoluciones para artículos rebajados.",
    ],
    faqs: (when, y) => [
      { q: `¿Cuándo empiezan las rebajas de enero ${y}?`, a: `El ${when} en la mayoría de tiendas. Algunas las adelantan en su web o para clientes registrados.` },
      { q: "¿Cuándo terminan las rebajas de invierno?", a: "Cada tienda decide, pero lo normal es que duren hasta finales de febrero o principios de marzo, con segundas rebajas a mitad de campaña." },
      { q: "¿Se pueden devolver artículos rebajados?", a: "Sí. Si compras online tienes los mismos 14 días de desistimiento que con cualquier otra compra. En tienda física depende de la política de cada comercio, que debe estar a la vista." },
    ],
  },
  {
    slug: "san-valentin",
    name: "San Valentín",
    calendarName: () => "San Valentín",
    lastsDays: 0,
    match: /san\s+valent[ií]n|valentine|enamorados/i,
    categories: ["moda"],
    what: "perfumería, joyería, moda y experiencias",
    lead: (when, y) =>
      `San Valentín ${y} es el ${when}. Perfumerías, joyerías, tiendas de moda y webs de experiencias lanzan ofertas en las dos semanas previas. Aquí tienes los chollos y códigos para el regalo de San Valentín activos hoy.`,
    sections: [
      {
        heading: "Cuándo comprar el regalo",
        paragraphs: [
          "Las ofertas suelen arrancar a finales de enero y los códigos más fuertes aparecen la primera semana de febrero. Si el regalo es físico, pide con al menos tres o cuatro días de margen para evitar sorpresas con el envío.",
          "Las experiencias y las tarjetas regalo no dependen del envío y suelen ser la mejor opción si vas tarde.",
        ],
      },
    ],
    tips: [
      "Revisa si la tienda ofrece envoltorio o mensaje de regalo gratis.",
      "En perfumería compara el tamaño del envase: el precio por mililitro dice más que el descuento.",
      "Pide ticket regalo por si hay que cambiar la talla.",
    ],
    faqs: (when, y) => [
      { q: `¿Cuándo es San Valentín ${y}?`, a: `El ${when}.` },
      { q: "¿Cuándo empiezan las ofertas de San Valentín?", a: "Normalmente a finales de enero o principios de febrero, unas dos semanas antes del 14." },
    ],
  },
  {
    slug: "dia-del-padre",
    name: "Día del Padre",
    calendarName: () => "Día del Padre",
    lastsDays: 0,
    match: /d[ií]a\s+del\s+padre|father'?s\s+day|para\s+pap[aá]/i,
    categories: ["tecnologia", "deporte", "moda"],
    what: "tecnología, deporte y moda de hombre",
    lead: (when, y) =>
      `El Día del Padre ${y} en España es el ${when}, día de San José. Las tiendas de tecnología, deporte y moda de hombre lanzan ofertas en las semanas anteriores. Aquí tienes los chollos y códigos descuento activos hoy para el regalo.`,
    sections: [
      {
        heading: "Una fecha fija",
        paragraphs: [
          "En España el Día del Padre se celebra el 19 de marzo, día de San José, caiga en el día de la semana que caiga. En otros países, como Estados Unidos o Reino Unido, es el tercer domingo de junio, así que no te fíes de las campañas de tiendas internacionales.",
          "Las ofertas suelen empezar a principios de marzo. Si pides online, deja al menos tres días de margen para el envío.",
        ],
      },
    ],
    tips: ["Pide ticket regalo, sobre todo en ropa y zapatillas.", "En tecnología compara el modelo exacto antes de fiarte del porcentaje.", "Las tarjetas regalo y las experiencias no dependen del envío."],
    faqs: (when, y) => [
      { q: `¿Cuándo es el Día del Padre ${y} en España?`, a: `El ${when}. En España siempre es el 19 de marzo, día de San José.` },
      { q: "¿Cuándo empiezan las ofertas del Día del Padre?", a: "Normalmente a principios de marzo, unas dos semanas antes." },
    ],
  },
  {
    slug: "dia-de-la-madre",
    name: "Día de la Madre",
    calendarName: () => "Día de la Madre",
    lastsDays: 0,
    match: /d[ií]a\s+de\s+la\s+madre|mother'?s\s+day|para\s+mam[aá]/i,
    categories: ["moda", "hogar"],
    what: "perfumería, belleza, moda y joyería",
    lead: (when, y) =>
      `El Día de la Madre ${y} en España es el ${when}, el primer domingo de mayo. Perfumerías, tiendas de belleza, moda y joyería preparan ofertas desde mediados de abril. Aquí tienes los chollos y códigos para el regalo activos hoy.`,
    sections: [
      {
        heading: "Cuándo se celebra",
        paragraphs: [
          "En España el Día de la Madre es el primer domingo de mayo. En muchos otros países es el segundo domingo, por eso algunas tiendas internacionales anuncian sus campañas una semana tarde.",
          "Como cae en domingo, conviene pedir online antes del miércoles para que llegue a tiempo.",
        ],
      },
    ],
    tips: ["Revisa si la tienda ofrece envoltorio o mensaje de regalo.", "En perfumería compara el precio por mililitro.", "Pide ticket regalo por si hay que cambiar talla o tono."],
    faqs: (when, y) => [
      { q: `¿Cuándo es el Día de la Madre ${y} en España?`, a: `El ${when}, el primer domingo de mayo.` },
      { q: "¿Cuándo empiezan las ofertas del Día de la Madre?", a: "Normalmente a mediados de abril, dos o tres semanas antes." },
    ],
  },
  {
    slug: "rebajas-de-verano",
    name: "Rebajas de verano",
    calendarName: () => "Rebajas de verano",
    lastsDays: 61,
    match: /rebajas|summer\s+sales?|\bsales?\b/i,
    matchOnlyInSeason: true,
    categories: ["moda", "zapatillas", "hogar"],
    what: "moda, zapatillas, bañadores y hogar",
    lead: (when, y) =>
      `Las rebajas de verano ${y} empiezan el ${when} en la mayoría de tiendas de moda y hogar, y duran hasta finales de agosto. Aquí tienes los chollos y códigos de rebajas activos hoy, con su fecha de caducidad.`,
    sections: [
      {
        heading: "Cuándo empiezan y cuánto duran",
        paragraphs: [
          "La fecha tradicional es el 1 de julio, aunque cada tienda puede elegir y muchas las adelantan a finales de junio en su web o para clientes registrados. Duran hasta finales de agosto, con segundas rebajas a mitad de julio.",
          OMNIBUS,
        ],
      },
    ],
    tips: [
      "Compra pronto lo que necesites en una talla concreta; deja para las segundas rebajas lo que sea un capricho.",
      "Mira si los códigos de la tienda se suman a la rebaja.",
      "Revisa la política de devoluciones de artículos rebajados.",
    ],
    faqs: (when, y) => [
      { q: `¿Cuándo empiezan las rebajas de verano ${y}?`, a: `El ${when} en la mayoría de tiendas, aunque muchas las adelantan a finales de junio.` },
      { q: "¿Cuándo terminan las rebajas de verano?", a: "Normalmente a finales de agosto, con segundas rebajas a partir de mediados de julio." },
    ],
  },
  {
    slug: "vuelta-al-cole",
    name: "Vuelta al cole",
    calendarName: () => "Vuelta al cole",
    lastsDays: 21,
    match: /vuelta\s+al\s+cole|back\s+to\s+school|material\s+escolar|mochilas?\s+escolar/i,
    categories: ["tecnologia", "moda", "zapatillas"],
    what: "material escolar, mochilas, ropa infantil, zapatillas y portátiles",
    lead: (when, y) =>
      `La vuelta al cole ${y} arranca a principios de septiembre: el ${when} empiezan las campañas fuertes, aunque muchas tiendas lanzan ofertas desde mediados de agosto. Aquí tienes los chollos y códigos de material escolar, mochilas, ropa y tecnología activos hoy.`,
    sections: [
      {
        heading: "Qué conviene comprar antes",
        paragraphs: [
          "Los libros de texto y el material que pide el colegio suelen tener poco margen de descuento, pero mochilas, estuches, zapatillas, ropa y portátiles sí entran en campaña. Las tiendas de tecnología suelen tener descuentos para estudiantes durante todo el año: merece la pena comprobarlo.",
          "El inicio de curso cambia según la comunidad autónoma, así que adelanta las compras si en la tuya empieza antes.",
        ],
      },
    ],
    tips: ["Haz la lista con lo que pide el colegio antes de comprar.", "En portátiles compara procesador, memoria y almacenamiento, no solo el precio.", "Mira si hay descuento de estudiante además del código."],
    faqs: (when, y) => [
      { q: `¿Cuándo empiezan las ofertas de vuelta al cole ${y}?`, a: "Las primeras aparecen a mediados de agosto y las más fuertes, a finales de agosto y la primera semana de septiembre." },
      { q: "¿Hay descuentos para estudiantes en tecnología?", a: "Muchas marcas de tecnología tienen programas para estudiantes todo el año. En CuponLab verás los códigos activos de cada tienda en su página." },
    ],
  },
];

export const eventPageOf = (slug: string): EventPage | undefined => EVENT_PAGES.find((e) => e.slug === slug);

const DAY_MS = 86_400_000;
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// The edition the page talks about: this year's until it is over (its date + lastsDays), then next year's
export function eventEdition(e: EventPage, todayIso: string): { year: number; date: string; ends: string } {
  const thisYear = Number(todayIso.slice(0, 4));
  for (const year of [thisYear - 1, thisYear, thisYear + 1]) {
    const entry = eventsOf(year).find((x) => x.name === e.calendarName(year));
    if (!entry) continue;
    const ends = addDays(entry.date, e.lastsDays);
    if (ends >= todayIso) return { year, date: entry.date, ends };
  }
  // unreachable while eventsOf lists every page's date; fall back to next year
  const date = eventsOf(thisYear + 1).find((x) => x.name === e.calendarName(thisYear + 1))?.date ?? `${thisYear + 1}-01-01`;
  return { year: thisYear + 1, date, ends: addDays(date, e.lastsDays) };
}

// Two weeks before the date until it ends: when a generic word («rebajas») counts as this event
const SEASON_LEAD_DAYS = 14;
export const inSeason = (e: EventPage, todayIso: string): boolean => {
  const { date, ends } = eventEdition(e, todayIso);
  return todayIso >= addDays(date, -SEASON_LEAD_DAYS) && todayIso <= ends;
};

type DealText = { title: string; description: string; store_category: string };

// The live deals that are about this event, and, while there are none, the ones from its categories to show instead
export function eventDeals<T extends DealText>(e: EventPage, live: readonly T[], todayIso: string): { matched: T[]; fallback: T[] } {
  const canMatch = !e.matchOnlyInSeason || inSeason(e, todayIso);
  const matched = canMatch ? live.filter((c) => e.match.test(`${c.title} ${c.description}`)) : [];
  const fallback = matched.length ? [] : e.categories.length ? live.filter((c) => (e.categories as readonly string[]).includes(c.store_category)) : [...live];
  return { matched, fallback };
}

// /ofertas/<event>/<store>: one page per store and shopping date («black friday myprotein»), as the sites that outrank
// us have (/cupones/especiales/black-friday/amazon). The URL is the same every year.
export const storeEventPath = (event: string, storeSlug: string) => `/ofertas/${event}/${storeSlug}`;

// From six weeks before the date until it ends: when a store's page for the event is linked from its store page and
// listed in the sitemap, so Google finds it before people start searching
const STORE_EVENT_LEAD_DAYS = 45;
export const storeEventSeason = (e: EventPage, todayIso: string): boolean => {
  const { date, ends } = eventEdition(e, todayIso);
  return todayIso >= addDays(date, -STORE_EVENT_LEAD_DAYS) && todayIso <= ends;
};

// The events whose store pages are in season today, nearest first
export const storeEventsInSeason = (todayIso: string): EventPage[] =>
  EVENT_PAGES.filter((e) => storeEventSeason(e, todayIso)).sort((a, b) => eventEdition(a, todayIso).date.localeCompare(eventEdition(b, todayIso).date));

// A store × event page is worth indexing only with something of its own to show: live coupons of the store that name
// the event. With none it shows the store's ordinary coupons under the event's text with another name (thin, and the
// same as its store page), so it stays out of the index and the sitemap, but its links are followed.
export const storeEventIndexable = (eventCouponsOfStore: number): boolean => eventCouponsOfStore > 0;

type StoreDeal = DealText & { store_slug: string; store_name: string; perk?: string | null };

// Per store, how many of its live coupons name the event (standing offers left out: they never mention a date). Only
// stores with at least one, most first: what the event's «por tienda» lists, the store × event pages and the sitemap use.
export function eventCouponsByStore<T extends StoreDeal>(e: EventPage, live: readonly T[], todayIso: string): { slug: string; name: string; n: number }[] {
  const { matched } = eventDeals(e, live.filter((c) => !isPerk(c)), todayIso);
  const by = new Map<string, { slug: string; name: string; n: number }>();
  for (const c of matched) by.set(c.store_slug, { slug: c.store_slug, name: c.store_name, n: (by.get(c.store_slug)?.n ?? 0) + 1 });
  return [...by.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "es"));
}
