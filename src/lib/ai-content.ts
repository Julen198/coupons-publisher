import { gateway, generateText, isStepCount, Output } from "ai";
import { z } from "zod";
import { sql, type Coupon, type Store } from "./db";
import { getUser } from "./auth";
import { usageOf, type AiFeature } from "./ai-costs";
import { assertWithinBudget } from "./ai-budget";
import { dealAboutInput, tidyDraft } from "./deal-about";
import { MODEL } from "./ai-model.ts";

// Every AI call goes through here so "Costes de IA" sees it: tokens, web searches and cost from the Gateway.
// ponytail: a failed call is logged at 0 although the model may have billed tokens (e.g. output that didn't fit the schema)
async function track<T extends { steps: Parameters<typeof usageOf>[0] }>(feature: AiFeature, about: string, call: () => Promise<T>): Promise<T> {
  try {
    const result = await call();
    await record(feature, about, usageOf(result.steps), true);
    return result;
  } catch (e) {
    await record(feature, about, { input: 0, output: 0, searches: 0, cost: 0, gatewayCost: 0 }, false);
    throw e;
  }
}

async function record(feature: AiFeature, about: string, u: ReturnType<typeof usageOf>, ok: boolean) {
  try {
    const user = await getUser();
    await sql()`
      INSERT INTO ai_usage (feature, about, user_name, input_tokens, output_tokens, web_searches, cost_total, cost_gateway, ok)
      VALUES (${feature}, ${about.slice(0, 200)}, ${user?.name ?? ""}, ${u.input}, ${u.output}, ${u.searches}, ${u.cost}, ${u.gatewayCost}, ${ok})`;
  } catch (e) {
    console.error("AI usage not recorded", feature, e); // never block the feature because of bookkeeping
  }
}

const ContentSchema = z.object({
  intro: z.string().describe("1-2 frases, máx. 220 caracteres"),
  faqs: z
    .array(z.object({ q: z.string(), a: z.string() }))
    .min(3)
    .max(6)
    .describe("Preguntas que la gente busca en Google sobre descuentos de esta tienda"),
});

export type StoreContent = z.infer<typeof ContentSchema>;

export async function generateStoreContent(store: Store, coupons: Coupon[]): Promise<StoreContent> {
  const live = coupons
    .filter((c) => !c.archived)
    .map((c) => `- ${c.title} (${c.discount || "oferta"}${c.code ? `, código ${c.code}` : ""}): ${c.description}`)
    .join("\n");

  const { output } = await track("content", store.name, () => generateText({
    model: MODEL,
    output: Output.object({ schema: ContentSchema }),
    system:
      "Escribes contenido SEO en español de España para páginas de cupones de descuento publicadas en medios. " +
      "Tono claro y útil, sin exageraciones ni promesas que no estén en los datos. No inventes códigos, porcentajes ni condiciones: " +
      "si un dato no está en la lista de cupones, responde de forma general. Las respuestas de las FAQs, de 1 a 2 frases.",
    prompt: `Tienda: ${store.name} (${store.website})\nCupones y ofertas actuales:\n${live || "(ninguno)"}\n\nEscribe la intro de la página y las FAQs.`,
  }));
  return output;
}

const AboutSchema = z.object({
  paragraphs: z.array(z.string()).min(2).max(2).describe("Exactamente 2 párrafos cortos; entre los dos, de 60 a 110 palabras"),
});

const ABOUT_SYSTEM = [
  "Escribes en español de España el texto «Sobre este chollo» de una web de cupones de descuento.",
  "Reglas:",
  "- Entre 60 y 110 palabras, en 2 párrafos cortos.",
  "- Usa solo los datos que te doy: título, descuento, si hace falta código, condiciones, fecha de caducidad, nombre de la tienda, datos de la tienda y su presentación.",
  "- Nunca inventes precios, stock, fechas, características de productos ni opiniones de usuarios. Si un dato no está, no lo menciones.",
  "- Di claramente a quién le sirve y cómo se usa (con código o sin código, y las condiciones que haya).",
  "- Sin frases de marketing, sin exclamaciones, sin superlativos vacíos.",
  "- No uses rayas (—) ni dos puntos en mitad de una frase.",
  "- Mayúscula solo al principio de la frase y en nombres propios.",
  "- No escribas el código descuento ni enlaces.",
].join("\n");

// Draft of "Sobre este chollo" for one deal; an editor reviews it before it is public
export async function generateDealAbout(coupon: Coupon, store: Store): Promise<string> {
  await assertWithinBudget();
  const { output } = await track("content", `chollo ${coupon.id}`, () => generateText({
    model: MODEL,
    output: Output.object({ schema: AboutSchema }),
    system: ABOUT_SYSTEM,
    prompt: `Datos del chollo:\n${dealAboutInput(coupon, store)}\n\nEscribe el texto.`,
  }));
  return tidyDraft(output.paragraphs);
}

// Store FAQs are kept as "Pregunta | Respuesta" lines; strip the separator from model text
export const faqsToText = (faqs: StoreContent["faqs"]) =>
  faqs.map(({ q, a }) => `${q.replaceAll("|", "/").trim()} | ${a.replaceAll("|", "/").trim()}`).join("\n");

const DisguiseSchema = z.object({
  name: z.string().describe("Nombre de la marca o medio, sin eslogan"),
  logoUrl: z.string().describe("Exactamente una de las URLs de 'Logos candidatos' si es el logo de la propia marca; si ninguno lo es, vacío"),
  color: z.string().describe("Color de marca #rrggbb, nunca blanco, negro ni gris. Si los colores del CSS no lo dejan claro, el color conocido de la marca"),
  nav: z.array(z.string()).describe("Hasta 8 secciones principales del menú, tal cual aparecen, sin 'Inicio' ni enlaces de cuenta/carrito"),
  font: z.enum(["serif", "sans"]).describe("serif si su tipografía principal es con remates (periódico clásico), si no sans"),
  fontFamily: z
    .string()
    .describe("Tipografía de Google Fonts para imitar su texto: la suya si está en Google Fonts (p. ej. Montserrat, Lato); si es propia, la de Google Fonts más parecida"),
  layout: z
    .enum(["newspaper", "store"])
    .describe("store si es una tienda online (logo a la izquierda, buscador, cuenta y cesta); newspaper si es un periódico o revista con cabecera centrada"),
});

// Reads the digest of a homepage (see siteDigest) and picks the bits that dress the demo like that site.
export async function disguiseFromDigest(digest: string, site: string): Promise<Partial<z.infer<typeof DisguiseSchema>>> {
  const { output } = await track("style", site, () => generateText({
    model: MODEL,
    output: Output.object({ schema: DisguiseSchema }),
    system:
      "Analizas el resumen de la portada de una web para imitar su cabecera en una demo. " +
      "Usa los datos del resumen; si faltan, lo que sepas de esa marca. Nunca inventes URLs. Responde en el idioma de la web.",
    prompt: digest,
  }));
  return output;
}

const StoreListSchema = z.object({
  stores: z.array(
    z.object({
      name: z.string().describe("Nombre comercial de la tienda/marca, bien escrito (p. ej. MediaMarkt, eDreams)"),
      website: z.string().describe("Web oficial para España con https:// (la .es si existe); vacío si no la conoces con seguridad"),
      merchantId: z.string().describe("Solo si el texto trae un ID numérico de anunciante para esta tienda; si no, vacío. Nunca lo inventes"),
    }),
  ),
});

// Turns any pasted text (names, an email, a table…) into a clean store list for the bulk import
export async function storesFromText(text: string): Promise<z.infer<typeof StoreListSchema>["stores"]> {
  const lines = text.split("\n").filter((l) => l.trim()).length;
  const { output } = await track("stores", `Lista de ${lines} línea${lines === 1 ? "" : "s"}`, () => generateText({
    model: MODEL,
    output: Output.object({ schema: StoreListSchema }),
    system:
      "Extraes tiendas online (anunciantes de afiliación) de un texto pegado por el usuario, en cualquier formato. " +
      "Una entrada por tienda, sin duplicados, en el orden del texto. Ignora lo que no sea una tienda. " +
      "Si el texto ya trae la web, usa esa. No inventes IDs.",
    prompt: text,
  }));
  return output.stores;
}

const FoundSchema = z.object({
  coupons: z.array(
    z.object({
      title: z.string().describe("Título corto del cupón u oferta, en español"),
      code: z.string().describe("El código exacto tal cual aparece; vacío si es una oferta sin código"),
      discount: z.string().describe("Solo la cifra, máx. 10 caracteres: '15%', '10€', 'Hasta 50%', '2x1', 'Envío gratis'; vacío si no hay cifra"),
      description: z.string().describe("Condiciones en una frase (mínimo de compra, nuevos clientes…)"),
      expires: z.string().describe("Fecha de caducidad AAAA-MM-DD si se indica; vacío si no"),
      sourceUrl: z.string().describe("URL de la página de resultados donde lo has visto"),
    }),
  ),
});

// Searches the web for this store's current coupons in Spain. Results are unverified by nature.
export async function findCouponsOnline(store: { name: string; website: string }, todayStr: string) {
  const { output } = await track("search", store.name, () => generateText({
    model: MODEL,
    tools: {
      perplexity_search: gateway.tools.perplexitySearch({ maxResults: 8, searchLanguageFilter: ["es"], country: "ES", searchRecencyFilter: "month" }),
    },
    stopWhen: isStepCount(4),
    output: Output.object({ schema: FoundSchema }),
    system:
      "Buscas códigos descuento y ofertas vigentes para España de una tienda online. Usa la búsqueda web. " +
      "Incluye solo lo que aparezca en los resultados, con su URL; nunca inventes códigos. " +
      "Descarta lo caducado, lo de otros países, lo genérico sin condiciones y los códigos de invitación/referido de " +
      "usuarios (llevan la comisión a otra persona). Máximo 8; si no hay nada fiable, lista vacía.",
    prompt: `Tienda: ${store.name} (${store.website}). Hoy es ${todayStr}. Busca sus códigos descuento y ofertas vigentes.`,
  }));
  return output.coupons;
}
