// Brand pages (/marcas/<slug>): one page per brand that gathers its deals from every store, for searches like
// «descuento Samsung» that a store page doesn't answer. Networks rarely say a product's brand, so a deal's brands are
// read from its title (and from its store, when the store is the brand's own shop); an editor can set them by hand in
// the coupon form (coupons.brand). Pure, so node:test covers it.
import type { CategorySlug } from "./catalog.ts";
import { CATEGORY_CONTENT, RETURNS } from "./category-pages.ts";
import { MONTHS, percentOf } from "./site-text.ts";

export type Brand = {
  slug: string;
  name: string;
  // other names a title may use for it (product lines, spellings): whole words, any case
  aliases?: readonly string[];
  category: CategorySlug | "";
  // one true sentence about the brand, for its page (no figures or claims that age)
  about: string;
};

// Hand-picked: brands with deals in Spanish shops and people searching «<marca> descuento». A new one is a line here.
export const BRANDS: readonly Brand[] = [
  // tecnología
  { slug: "samsung", name: "Samsung", category: "tecnologia", about: "Samsung es el fabricante surcoreano de los móviles Galaxy, televisores, monitores y electrodomésticos como frigoríficos y lavadoras." },
  { slug: "apple", name: "Apple", aliases: ["iPhone", "iPad", "MacBook", "iMac", "AirPods", "Apple Watch"], category: "tecnologia", about: "Apple diseña el iPhone, el iPad, los ordenadores Mac, el Apple Watch y los AirPods." },
  { slug: "xiaomi", name: "Xiaomi", aliases: ["Redmi"], category: "tecnologia", about: "Xiaomi es la marca china de móviles Xiaomi, Redmi y POCO, que también vende patinetes, robots aspiradores y pequeños electrodomésticos." },
  { slug: "sony", name: "Sony", category: "tecnologia", about: "Sony fabrica televisores Bravia, auriculares, cámaras y equipos de sonido." },
  { slug: "lg", name: "LG", category: "tecnologia", about: "LG es la marca surcoreana de televisores OLED, monitores y electrodomésticos." },
  { slug: "philips", name: "Philips", category: "tecnologia", about: "Philips vende afeitadoras, cepillos de dientes eléctricos, freidoras de aire, iluminación Hue y pequeños electrodomésticos." },
  { slug: "huawei", name: "Huawei", category: "tecnologia", about: "Huawei fabrica relojes inteligentes, auriculares, portátiles, tabletas y móviles." },
  { slug: "lenovo", name: "Lenovo", aliases: ["ThinkPad", "IdeaPad"], category: "tecnologia", about: "Lenovo fabrica portátiles (ThinkPad, IdeaPad, Legion), ordenadores de sobremesa y tabletas." },
  { slug: "hp", name: "HP", category: "tecnologia", about: "HP fabrica portátiles, ordenadores, impresoras y sus cartuchos de tinta." },
  { slug: "asus", name: "Asus", aliases: ["ROG"], category: "tecnologia", about: "Asus fabrica portátiles, portátiles gaming ROG, placas base, tarjetas gráficas y routers." },
  { slug: "acer", name: "Acer", category: "tecnologia", about: "Acer fabrica portátiles, monitores y ordenadores, también gaming con su gama Predator." },
  { slug: "logitech", name: "Logitech", category: "tecnologia", about: "Logitech fabrica ratones, teclados, webcams, auriculares y periféricos para gaming." },
  { slug: "jbl", name: "JBL", category: "tecnologia", about: "JBL fabrica altavoces portátiles, barras de sonido y auriculares." },
  { slug: "playstation", name: "PlayStation", aliases: ["PS5", "PS4"], category: "tecnologia", about: "PlayStation es la consola de Sony: la PS5, sus mandos, accesorios y videojuegos." },
  { slug: "nintendo", name: "Nintendo", category: "tecnologia", about: "Nintendo hace la consola Switch y juegos de Mario, Zelda y Pokémon." },
  { slug: "xbox", name: "Xbox", category: "tecnologia", about: "Xbox es la consola de Microsoft, con sus mandos, juegos y la suscripción Game Pass." },
  { slug: "garmin", name: "Garmin", category: "deporte", about: "Garmin fabrica relojes GPS para correr, ciclocomputadores y pulseras de actividad." },
  // hogar
  { slug: "dyson", name: "Dyson", category: "hogar", about: "Dyson fabrica aspiradoras sin cable, secadores de pelo, purificadores y ventiladores." },
  { slug: "cecotec", name: "Cecotec", aliases: ["Conga"], category: "hogar", about: "Cecotec es la marca valenciana de robots aspiradores Conga, freidoras de aire, patinetes y pequeños electrodomésticos." },
  { slug: "bosch", name: "Bosch", category: "hogar", about: "Bosch fabrica electrodomésticos, herramientas eléctricas y de jardín." },
  { slug: "rowenta", name: "Rowenta", category: "hogar", about: "Rowenta fabrica planchas, aspiradoras, ventiladores y aparatos de cuidado del pelo." },
  { slug: "delonghi", name: "De'Longhi", aliases: ["DeLonghi", "De Longhi"], category: "hogar", about: "De'Longhi fabrica cafeteras automáticas y de cápsulas, además de pequeños electrodomésticos de cocina." },
  { slug: "lego", name: "LEGO", category: "", about: "LEGO hace los juegos de construcción con piezas, con sets de Star Wars, Technic, City y Harry Potter." },
  // zapatillas
  { slug: "nike", name: "Nike", aliases: ["Air Jordan", "Jordan", "Air Max", "Air Force"], category: "zapatillas", about: "Nike es la marca de zapatillas y ropa deportiva de las Air Max, Air Force 1, Pegasus y la línea Jordan." },
  { slug: "adidas", name: "Adidas", category: "zapatillas", about: "Adidas es la marca alemana de las Samba, Gazelle, Stan Smith y Ultraboost, y de ropa deportiva y de fútbol." },
  { slug: "puma", name: "Puma", category: "zapatillas", about: "Puma es la marca alemana de zapatillas, ropa deportiva y equipaciones de fútbol." },
  { slug: "new-balance", name: "New Balance", category: "zapatillas", about: "New Balance fabrica zapatillas de running y de calle, como las 574, 530 y 990." },
  { slug: "asics", name: "Asics", category: "zapatillas", about: "Asics es la marca japonesa de zapatillas de running Gel-Kayano, Gel-Nimbus y Novablast." },
  { slug: "converse", name: "Converse", category: "zapatillas", about: "Converse es la marca de las zapatillas de lona Chuck Taylor All Star." },
  { slug: "vans", name: "Vans", category: "zapatillas", about: "Vans es la marca de zapatillas de skate como las Old Skool, Authentic y Slip-On." },
  { slug: "reebok", name: "Reebok", category: "zapatillas", about: "Reebok fabrica zapatillas como las Club C y Classic Leather y ropa de entrenamiento." },
  { slug: "skechers", name: "Skechers", category: "zapatillas", about: "Skechers fabrica zapatillas cómodas para caminar y para el día a día." },
  { slug: "hoka", name: "Hoka", category: "zapatillas", about: "Hoka fabrica zapatillas de running con mucha amortiguación, como las Clifton y las Bondi." },
  // deporte y moda
  { slug: "under-armour", name: "Under Armour", category: "deporte", about: "Under Armour fabrica ropa técnica de entrenamiento, zapatillas y accesorios deportivos." },
  { slug: "the-north-face", name: "The North Face", category: "deporte", about: "The North Face fabrica chaquetas, forros polares, mochilas y ropa de montaña." },
  { slug: "columbia", name: "Columbia", category: "deporte", about: "Columbia fabrica chaquetas, botas y ropa de montaña y de nieve." },
  { slug: "salomon", name: "Salomon", category: "deporte", about: "Salomon fabrica zapatillas de trail running, botas de montaña y material de esquí." },
  { slug: "levis", name: "Levi's", aliases: ["Levis"], category: "moda", about: "Levi's es la marca de vaqueros de los 501, además de camisetas y cazadoras." },
  { slug: "tommy-hilfiger", name: "Tommy Hilfiger", aliases: ["Tommy Jeans"], category: "moda", about: "Tommy Hilfiger es la marca de moda de ropa, bolsos y relojes, con su línea Tommy Jeans." },
  { slug: "calvin-klein", name: "Calvin Klein", category: "moda", about: "Calvin Klein es la marca de ropa interior, vaqueros, perfumes y moda." },
  { slug: "lacoste", name: "Lacoste", category: "moda", about: "Lacoste es la marca francesa del polo del cocodrilo, con ropa, zapatillas y perfumes." },
  { slug: "ray-ban", name: "Ray-Ban", aliases: ["RayBan"], category: "moda", about: "Ray-Ban fabrica gafas de sol y graduadas, como las Wayfarer y las Aviator." },
];

export const brandOf = (slug: string): Brand | undefined => BRANDS.find((b) => b.slug === slug);
export const brandPath = (slug: string): string => `/marcas/${slug}`;

// Below this many live deals a brand page is close to empty: still reachable, but out of the index (as categories)
export const MIN_BRAND_DEALS = 3;
export const indexableBrand = (liveDeals: number): boolean => liveDeals >= MIN_BRAND_DEALS;

// coupons.brand, set in the panel: '' = read from the title, '-' = no brand, else brand slugs separated by commas
export const BRAND_NONE = "-";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every name of every brand, longest first ("Air Jordan" before "Jordan"), each a whole word in any case
const NAMES = BRANDS.flatMap((b) => [b.name, ...(b.aliases ?? [])].map((n) => ({ n, slug: b.slug }))).sort((a, b) => b.n.length - a.n.length);
const BY_NAME = new Map(NAMES.map(({ n, slug }) => [n.toLowerCase(), slug]));
const NAME_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${NAMES.map(({ n }) => escapeRe(n)).join("|")})(?![\\p{L}\\p{N}])`, "giu");
// «funda para iPhone», «compatible con PS5», «cargador tipo Apple»: an accessory for the brand, not the brand
const FOR_ANOTHER = /(?:\bpara|\bcompatibles?(?: con)?|\bfor|\btipo|\bestilo)\s+(?:(?:el|la|los|las|tu|su|tus|sus)\s+)?$/iu;

// The brands a text names (slugs, in order of first mention, each once)
export function brandsInText(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(NAME_RE)) {
    if (FOR_ANOTHER.test(text.slice(0, m.index))) continue;
    const slug = BY_NAME.get(m[0].toLowerCase());
    if (slug && !found.includes(slug)) found.push(slug);
  }
  return found;
}

// coupons.brand from the panel's form: '' (automatic), '-' (none) or known slugs; anything else reads as automatic
export function brandInput(raw: string): string {
  const v = raw.trim();
  if (v === BRAND_NONE) return BRAND_NONE;
  return [...new Set(v.split(",").map((s) => s.trim()).filter((s) => brandOf(s)))].join(",");
}

// A deal's brands: the editor's choice when there is one; else the brands its title names, else its store's own brand
// (a deal of the Nike shop is a Nike deal even when its title only says «zapatillas»)
export function dealBrands(c: { title: string; store_name: string; brand?: string | null }): string[] {
  const own = (c.brand ?? "").trim();
  if (own === BRAND_NONE) return [];
  if (own) return brandInput(own).split(",").filter(Boolean);
  const named = brandsInText(c.title);
  return named.length ? named : brandsInText(c.store_name).slice(0, 1);
}

// ---- the text of a brand page, true whatever the deals of the day: the figures come from the live deals

type PageDeal = { kind: string; code: string; discount: string; store_name: string };

// «A», «A y B», «A, B y C»
export const listOf = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;

// The <title>: brand, the best percentage when there is one, month and year (a store page's title says the same)
export function brandTitle(brand: Brand, deals: readonly PageDeal[], now: Date): string {
  const best = Math.max(0, ...deals.map((d) => percentOf(d.discount)));
  const when = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  return `Ofertas ${brand.name}${deals.length && best ? `: hasta ${String(best).replace(".", ",")} % de descuento` : " y códigos descuento"} en ${when}`;
}

export function brandFaqs(brand: Brand, deals: readonly PageDeal[]): { q: string; a: string }[] {
  const stores = [...new Set(deals.map((d) => d.store_name))];
  const codes = deals.filter((d) => d.kind === "code" && d.code.trim()).length;
  const when = brand.category
    ? CATEGORY_CONTENT[brand.category].faqs[0].a
    : "En Black Friday y Cyber Monday, a finales de noviembre, y en las rebajas de enero y de verano. Fuera de esas fechas las tiendas sacan ofertas puntuales.";
  return [
    {
      q: `¿Dónde comprar ${brand.name} con descuento?`,
      a: stores.length
        ? `Hoy hay ofertas de ${brand.name} en ${listOf(stores)}. Cada oferta indica la tienda, el descuento, sus condiciones y hasta cuándo vale.`
        : `Ahora mismo no tenemos ofertas activas de ${brand.name}. Revisamos las tiendas a diario y las nuevas salen en esta página en cuanto las publicamos.`,
    },
    {
      q: `¿Hay códigos descuento de ${brand.name}?`,
      a: codes
        ? `Sí: hoy ${codes === 1 ? "hay 1 oferta" : `hay ${codes} ofertas`} de ${brand.name} con código. ${codes < deals.length ? "Las demás se aplican sin código, directamente en la tienda." : ""}`.trim()
        : deals.length
          ? `Hoy no hay códigos de ${brand.name}: sus ofertas activas se aplican sin código, directamente en la tienda.`
          : `Hoy no hay códigos de ${brand.name}. Cuando una tienda saque uno lo verás aquí.`,
    },
    { q: `¿Cuándo hay más ofertas de ${brand.name}?`, a: when },
    { q: `¿Puedo devolver un producto de ${brand.name} comprado con descuento?`, a: `Sí, igual que a precio normal. ${RETURNS}` },
  ];
}
