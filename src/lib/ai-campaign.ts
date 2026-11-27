// Writes the text of one store on one shopping date (/ofertas/<evento>/<tienda>) with the AI. campaigns-cron.ts decides
// which pages and checks the result (campaign-rules.ts).
import { generateText, Output } from "ai";
import { z } from "zod";
import { track } from "./ai-content";
import { assertWithinBudget } from "./ai-budget";
import { GUIDE_MODEL } from "./ai-model.ts";
import type { StoreGuide } from "./store-guides.ts";

// No min/max here: the provider doesn't enforce array lengths, and a text with 5 sections or 6 FAQs threw
// «response did not match schema» and lost the page. The ranges go in the descriptions and are applied after.
const Schema = z.object({
  description: z.string().describe("Meta description de 140 a 160 caracteres que empieza por la keyword"),
  lead: z.string().describe("Entradilla de 2-3 frases que incluye la keyword literal"),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        paragraphs: z.array(z.string()).describe("1 a 3 párrafos"),
        steps: z.array(z.string()).nullish().describe("Opcional: hasta 6 pasos en orden"),
      }),
    )
    .describe("2 a 4 secciones"),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).describe("3 a 5 preguntas frecuentes"),
});

type Raw = z.infer<typeof Schema>;

// Keeps the shape the page expects whatever lengths came back
export function shapeCampaign(o: Raw): Omit<StoreGuide, "slug" | "keyword"> {
  const sections = o.sections
    .map((s) => ({ heading: s.heading.trim(), paragraphs: s.paragraphs.map((p) => p.trim()).filter(Boolean).slice(0, 3), ...(s.steps?.length ? { steps: s.steps.slice(0, 6) } : {}) }))
    .filter((s) => s.heading && s.paragraphs.length)
    .slice(0, 4);
  const faqs = o.faqs.filter((f) => f.q.trim() && f.a.trim()).slice(0, 5);
  return { description: o.description.trim(), lead: o.lead.trim(), sections, faqs };
}

const SYSTEM = [
  "Escribes en español de España el texto de una página de CuponLab, una web de cupones verificados, sobre una tienda en una fecha de compras concreta (por ejemplo «Black Friday Shein»).",
  "El texto va debajo de la lista de cupones de esa tienda y responde a la búsqueda «<keyword>».",
  "Reglas:",
  "- Entre 400 y 750 palabras en total.",
  "- Específico de ESTA tienda en ESTA fecha: qué suele rebajar según los cupones que te doy, qué tipo de descuentos tiene (códigos, outlet, envío, primera compra…), cómo prepararse y qué mirar antes de pagar. Nada que valga igual para cualquier tienda cambiando el nombre.",
  "- Usa solo los datos que te doy. Nunca inventes códigos, porcentajes, importes, fechas, horarios de inicio ni condiciones. Si no sabes cuándo empieza la tienda, dilo así: «la tienda anuncia sus fechas».",
  "- La fecha del evento es la que te doy. El único año que puedes escribir es el de la edición.",
  "- No afirmes políticas de envío, devoluciones ni plazos salvo que vengan en «Datos de la tienda».",
  "- Las cifras de cada cupón cambian: remite a la lista de arriba en vez de repetirlas.",
  "- No escribas ningún código descuento.",
  "- Una sección dice qué conviene hacer antes de la fecha en esta tienda (cuenta, newsletter, lista de deseos, si los cupones se suman a lo rebajado según sus condiciones).",
  "- Tono claro y útil, sin exclamaciones, sin superlativos vacíos, sin rayas (—).",
  "- Mayúscula solo al principio de frase y en nombres propios.",
].join("\n");

export interface CampaignInput {
  slug: string; storeName: string; website: string; category: string; facts: string; intro: string;
  eventName: string; year: number; date: string; // «Black Friday», 2026, «viernes 27 de noviembre»
  eventWhat: string; keyword: string; searches: string[];
  coupons: { kind: string; title: string; discount: string; description: string; expires_at: string; forEvent: boolean }[];
  fix?: string[];
}

const line = (c: CampaignInput["coupons"][number]) =>
  `- ${c.forEvent ? "[de la fecha] " : ""}${c.kind === "code" ? "Código" : "Oferta"}: ${c.title}${c.discount ? ` (${c.discount})` : ""}${c.expires_at ? `, caduca ${c.expires_at}` : ""}. ${c.description}`.trim();

export async function generateCampaignText(input: CampaignInput): Promise<StoreGuide> {
  await assertWithinBudget();
  const prompt = [
    `Keyword: ${input.keyword}`,
    `Fecha: ${input.eventName} ${input.year}, el ${input.date}. Lo que más se compra: ${input.eventWhat}.`,
    `Tienda: ${input.storeName} (${input.website})${input.category ? `, categoría ${input.category}` : ""}`,
    `Datos de la tienda: ${input.facts.trim() || "(ninguno)"}`,
    input.intro.trim() ? `Presentación: ${input.intro.trim()}` : "",
    input.searches.length ? `Búsquedas reales de Google que llegan a esta página: ${input.searches.slice(0, 8).join("; ")}. Respóndelas.` : "",
    `Cupones y ofertas activos ahora (${input.coupons.length}; los marcados [de la fecha] son de ${input.eventName}):`,
    ...input.coupons.slice(0, 30).map(line),
    input.fix?.length ? `\nUn intento anterior no valía por esto, corrígelo: ${input.fix.join("; ")}.` : "",
    "",
    "Escribe el texto.",
  ].filter(Boolean).join("\n");
  const { output } = await track("guides", `${input.eventName} · ${input.storeName}`, () =>
    generateText({ model: GUIDE_MODEL, output: Output.object({ schema: Schema }), system: SYSTEM.replace("<keyword>", input.keyword), prompt }),
  );
  return { slug: input.slug, keyword: input.keyword, ...shapeCampaign(output) };
}
