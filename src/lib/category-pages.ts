// The text of each category page (/categorias/<slug>): a short intro and questions people ask, so the page is more than
// a list of deals. Hand-written and true whatever the deals of the day; the figures are worked out per request.
import type { CategorySlug } from "./catalog.ts";

// Below this many live deals a category page is close to empty: still reachable, but out of the index
export const MIN_CATEGORY_DEALS = 3;

export const indexableCategory = (liveDeals: number): boolean => liveDeals >= MIN_CATEGORY_DEALS;

export interface CategoryContent {
  intro: string;
  faqs: { q: string; a: string }[];
}

const RETURNS = "Las compras online en España tienen 14 días naturales de desistimiento desde que recibes el pedido, salvo excepciones como productos personalizados o precintados que se han abierto. Cada tienda indica en su web cómo devolver.";

export const CATEGORY_CONTENT: Record<CategorySlug, CategoryContent> = {
  tecnologia: {
    intro:
      "Chollos y códigos descuento de tiendas de tecnología, informática y electrónica: móviles, portátiles, televisores, componentes y accesorios. En tecnología el descuento depende mucho del modelo exacto, así que cada oferta indica el producto, las condiciones y hasta cuándo vale.",
    faqs: [
      { q: "¿Cuándo hay más descuentos en tecnología?", a: "En Black Friday y Cyber Monday, a finales de noviembre, y en menor medida en el Día del Soltero (11 de noviembre) y en la vuelta al cole. Fuera de esas fechas las tiendas sacan ofertas flash de pocas horas." },
      { q: "¿Los códigos descuento sirven para productos ya rebajados?", a: "Depende de la tienda. Muchas excluyen los artículos en oferta o ciertas marcas; las condiciones de cada chollo lo indican." },
      { q: "¿Qué pasa si quiero devolver un producto de tecnología?", a: RETURNS },
    ],
  },
  zapatillas: {
    intro:
      "Chollos y códigos descuento de tiendas de zapatillas y sneakers: running, baloncesto, moda urbana y lanzamientos. Las tallas vuelan en las ofertas buenas, así que cada chollo indica hasta cuándo vale y si hace falta código.",
    faqs: [
      { q: "¿Cuándo hay más ofertas de zapatillas?", a: "En las rebajas de enero y de verano, en Black Friday y en las campañas de las propias marcas para sus socios. Muchas tiendas dan un código de bienvenida al registrarse." },
      { q: "¿Puedo cambiar la talla si me quedan mal?", a: "Sí, dentro del plazo de devolución de cada tienda. " + RETURNS },
      { q: "¿Los códigos sirven para lanzamientos?", a: "Casi nunca: las ediciones limitadas y los lanzamientos suelen quedar fuera de los descuentos. Las condiciones de cada código lo dicen." },
    ],
  },
  moda: {
    intro:
      "Chollos y códigos descuento de tiendas de moda de mujer, hombre y niños: ropa, accesorios y complementos. Cada oferta indica las condiciones, como la compra mínima o las prendas excluidas, y hasta cuándo vale.",
    faqs: [
      { q: "¿Cuándo empiezan las rebajas de moda?", a: "Tradicionalmente el 7 de enero y el 1 de julio, aunque cada tienda puede elegir sus fechas y muchas las adelantan en su web." },
      { q: "¿Se suman los códigos descuento a las rebajas?", a: "Algunas tiendas lo permiten y otras excluyen los artículos rebajados. Las condiciones de cada código lo indican." },
      { q: "¿Puedo devolver la ropa que compre con descuento?", a: RETURNS },
    ],
  },
  hogar: {
    intro:
      "Chollos y códigos descuento de tiendas de hogar, muebles, decoración, jardín y electrodomésticos. En compras grandes conviene mirar el coste y el plazo de envío además del descuento; cada oferta indica sus condiciones y su fecha de caducidad.",
    faqs: [
      { q: "¿Cuándo hay más ofertas en hogar y muebles?", a: "En las rebajas de enero y de verano y en Black Friday. Los electrodomésticos suelen tener sus mejores precios en Black Friday." },
      { q: "¿El envío de muebles está incluido?", a: "Depende de la tienda y del tamaño del pedido. Muchas cobran aparte el envío de muebles grandes o el montaje; revísalo antes de pagar." },
      { q: "¿Puedo devolver un mueble?", a: RETURNS + " En muebles grandes, la recogida puede tener coste." },
    ],
  },
  deporte: {
    intro:
      "Chollos y códigos descuento de tiendas de deporte: ropa técnica, material de gimnasio, ciclismo, natación, fútbol y nutrición deportiva. Cada oferta indica para qué productos vale y hasta cuándo.",
    faqs: [
      { q: "¿Cuándo hay más ofertas de deporte?", a: "En enero, cuando mucha gente empieza a entrenar, en las rebajas de verano y en Black Friday." },
      { q: "¿Los códigos sirven para nutrición deportiva?", a: "Muchas tiendas de suplementos tienen códigos propios y packs con descuento. Revisa si el código excluye productos ya rebajados." },
      { q: "¿Puedo devolver material deportivo?", a: RETURNS },
    ],
  },
  viajes: {
    intro:
      "Chollos y códigos descuento de viajes: vuelos, hoteles, alquiler de coches y experiencias. En viajes el precio cambia según las fechas, así que cada oferta indica para qué fechas o destinos vale y hasta cuándo se puede reservar.",
    faqs: [
      { q: "¿Los códigos de viajes sirven para cualquier fecha?", a: "No siempre: muchos se limitan a ciertas fechas de viaje, destinos o a una reserva mínima. Las condiciones de cada oferta lo indican." },
      { q: "¿Puedo cancelar una reserva hecha con descuento?", a: "Depende de la tarifa que elijas, no del código. Las tarifas no reembolsables suelen ser más baratas pero no admiten cancelación." },
      { q: "¿Se aplica el derecho de desistimiento a los viajes?", a: "No a todo: los billetes de transporte y los alojamientos con fecha concreta quedan fuera de los 14 días de desistimiento. Revisa la política de cancelación antes de reservar." },
    ],
  },
};
