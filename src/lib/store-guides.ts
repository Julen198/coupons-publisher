// Hand-written SEO guides for a few stores: long-form text that sits under the live coupons on /tiendas/<slug>.
// The page keeps one URL per store (no separate article that would compete with it for the same search); the
// guide only adds what a reader of "código descuento <tienda>" wants to know beyond the list of offers.
// Everything here is evergreen: live figures (codes, amounts, dates) come from the coupons on the page itself,
// and nothing states a store policy we have not checked (envíos, devoluciones): those belong in the store's facts.

export type GuideSection = {
  heading: string;
  paragraphs: string[];
  steps?: string[]; // an ordered list after the paragraphs (a how-to)
};

export type StoreGuide = {
  slug: string;
  keyword: string; // the search the page is written for
  description: string; // meta description, ~150 characters
  lead: string;
  sections: GuideSection[];
  faqs: { q: string; a: string }[];
};

const GUIDES: StoreGuide[] = [
  {
    slug: "atmosfera-sport",
    keyword: "código descuento Atmosfera Sport",
    description:
      "Código descuento Atmosfera Sport comprobado hoy, ofertas del outlet por deporte y marca, y cómo aplicar el cupón en el carrito paso a paso.",
    lead:
      "Atmosfera Sport es una cadena española de material deportivo con tiendas físicas y tienda online (atmosferasport.es). Sus descuentos llegan casi siempre de dos formas: un código de importe fijo para la primera compra y un outlet permanente dividido por sección, deporte y marca. En esta página tienes los dos, comprobados, y debajo te contamos cómo sacarles partido.",
    sections: [
      {
        heading: "Qué descuentos tiene Atmosfera Sport",
        paragraphs: [
          "El código descuento de Atmosfera Sport más habitual es el de bienvenida: un importe fijo en euros que se resta del total del pedido. Al ser una cantidad fija, rinde más cuanto más barata es la compra: en unos calcetines técnicos o una camiseta se nota mucho más que en unas zapatillas de 120 €.",
          "El grueso del ahorro está en el outlet, que no necesita código. Está organizado por sección (hombre, mujer, niños y niñas, zapatillas), por deporte (fútbol, running, fitness, ciclismo, natación, baloncesto) y por marca (adidas, Nike, Puma y otras marcas deportivas). Cada uno tiene su propia oferta en el listado de arriba, así que puedes ir directo a la parte del outlet que te interesa en lugar de recorrer todo el catálogo.",
          "A eso se suman campañas de temporada, como la de mitad de temporada de otoño, que suelen durar pocos días. Las marcamos con su fecha de caducidad y desaparecen de la página cuando terminan.",
        ],
      },
      {
        heading: "Cómo usar un código descuento en Atmosfera Sport",
        paragraphs: ["Aplicar el cupón lleva menos de un minuto:"],
        steps: [
          "Pulsa «Copiar» en el código de esta página. Se copia al portapapeles.",
          "Entra en Atmosfera Sport con el botón «Ir a Atmosfera Sport» y añade al carrito lo que quieras comprar.",
          "En el carrito, busca la casilla de código promocional, pega el código y pulsa aplicar.",
          "Comprueba que el total baja antes de pagar. Si no baja, mira la sección siguiente.",
        ],
      },
      {
        heading: "Si el código no funciona",
        paragraphs: [
          "Casi siempre es por una de estas razones: el código es solo para la primera compra y tu cuenta ya tiene pedidos, el carrito no llega al importe mínimo, algún producto está excluido (lo normal es que el outlet o los artículos ya rebajados no acumulen otro descuento), o el código ha caducado.",
          "Las condiciones de cada código están en su ficha. Si un código comprobado deja de funcionar, márcalo como caducado desde su ficha: lo revisamos y lo retiramos para que no le pase a nadie más.",
        ],
      },
      {
        heading: "Código o outlet: qué te compensa",
        paragraphs: [
          "Si vas a comprar algo que ya está en el outlet, el porcentaje del outlet suele ahorrar más que un código de pocos euros, y puede que no se puedan combinar. Si lo que buscas no está rebajado, el código de bienvenida es la forma más sencilla de pagar algo menos.",
          "Antes de grandes campañas como el Black Friday o las rebajas de enero conviene volver a esta página: es cuando las tiendas de deporte amplían el outlet y lanzan códigos nuevos, y los añadimos el mismo día.",
        ],
      },
    ],
    faqs: [
      {
        q: "¿Hay algún código descuento de Atmosfera Sport que funcione hoy?",
        a: "Sí. Arriba tienes los códigos y ofertas de Atmosfera Sport activos ahora mismo, con la hora de la última actualización. Solo mostramos los que siguen vigentes: los caducados se retiran solos.",
      },
      {
        q: "¿El código de bienvenida de Atmosfera Sport sirve para cualquier pedido?",
        a: "Los códigos de bienvenida suelen estar pensados para la primera compra en la tienda online. Las condiciones exactas, como el importe mínimo o la fecha de caducidad, están en la ficha de cada código.",
      },
      {
        q: "¿Puedo usar el código en productos del outlet?",
        a: "Depende del código. Es habitual que los artículos ya rebajados no acumulen otro descuento. Añade el producto al carrito y aplica el código: si no se descuenta, compara si te sale mejor el precio del outlet o el código en otro artículo.",
      },
      {
        q: "¿Se pueden usar dos códigos en el mismo pedido?",
        a: "Por lo general el carrito solo acepta un código por pedido. Si tienes varios, usa el que más ahorre sobre el total.",
      },
      {
        q: "¿Los códigos sirven en las tiendas físicas de Atmosfera Sport?",
        a: "Los códigos que publicamos son de la tienda online atmosferasport.es. Para comprar en tienda física, pregunta en caja si tienen alguna promoción en vigor.",
      },
    ],
  },
];

export const storeGuide = (slug: string): StoreGuide | undefined => GUIDES.find((g) => g.slug === slug);

export const guideSlugs = (): string[] => GUIDES.map((g) => g.slug);
