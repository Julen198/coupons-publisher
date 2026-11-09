// Writes one store's SEO guide with the AI (the cron in guides-cron.ts decides which store and checks the result).
import { generateText, Output } from "ai";
import { z } from "zod";
import { track } from "./ai-content";
import { assertWithinBudget } from "./ai-budget";
import { GUIDE_MODEL } from "./ai-model.ts";
import type { StoreGuide } from "./store-guides.ts";

const GuideSchema = z.object({
  description: z.string().describe("Meta description de 140 a 160 caracteres que empieza por la keyword"),
  lead: z.string().describe("Entradilla de 2-3 frases que incluye la keyword literal"),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        paragraphs: z.array(z.string()).min(1).max(4),
        steps: z.array(z.string()).max(6).optional().describe("Solo en la sección de cómo usar un código: pasos en orden"),
      }),
    )
    .min(3)
    .max(5),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).min(4).max(6),
});

const SYSTEM = [
  "Escribes en español de España la guía de una tienda en CuponLab, una web de cupones y códigos descuento verificados.",
  "La guía va debajo de la lista de cupones de la tienda y responde a la búsqueda «<keyword>» mejor que una lista suelta.",
  "Reglas:",
  "- Entre 600 y 1000 palabras en total.",
  "- Específica de ESTA tienda: qué vende, qué tipo de descuentos tiene según los cupones que te doy (códigos, outlet, rebajas, primera compra…), qué conviene saber antes de comprar. Nada que valga igual para cualquier tienda cambiando el nombre.",
  "- Usa solo los datos que te doy. Nunca inventes códigos, porcentajes, importes, fechas, precios ni condiciones.",
  "- No afirmes políticas de envío, devoluciones ni plazos salvo que vengan en «Datos de la tienda».",
  "- Las cifras concretas (importe de un código, fecha de caducidad) cambian: remite a la lista de arriba en vez de repetirlas.",
  "- No escribas ningún código descuento.",
  "- La guía tiene que seguir siendo verdad dentro de meses: no la construyas sobre campañas con fecha (Black Friday, rebajas, un «Black Month»…) ni las pongas en títulos o en la entradilla; descríbelas como tipos de descuento que la tienda suele tener.",
  "- Una sección explica cómo aplicar un código en la tienda, con pasos. Otra, qué hacer si un código no funciona.",
  "- Tono claro y útil, sin exclamaciones, sin superlativos vacíos, sin rayas (—).",
  "- Mayúscula solo al principio de frase y en nombres propios.",
].join("\n");

export interface GuideInput {
  slug: string;
  name: string;
  website: string;
  category: string;
  facts: string;
  intro: string;
  keyword: string;
  coupons: { kind: string; title: string; discount: string; description: string; expires_at: string }[];
  fix?: string[]; // what the previous attempt got wrong (guideProblems), for a second try
}

const couponLine = (c: GuideInput["coupons"][number]) =>
  `- ${c.kind === "code" ? "Código" : "Oferta"}: ${c.title}${c.discount ? ` (${c.discount})` : ""}${c.expires_at ? `, caduca ${c.expires_at}` : ""}. ${c.description}`.trim();

export async function generateStoreGuide(input: GuideInput): Promise<StoreGuide> {
  await assertWithinBudget();
  const prompt = [
    `Keyword: ${input.keyword}`,
    `Tienda: ${input.name} (${input.website})${input.category ? `, categoría ${input.category}` : ""}`,
    `Datos de la tienda: ${input.facts.trim() || "(ninguno)"}`,
    input.intro.trim() ? `Presentación: ${input.intro.trim()}` : "",
    `Cupones y ofertas activos ahora (${input.coupons.length}):`,
    ...input.coupons.slice(0, 40).map(couponLine),
    input.fix?.length ? `\nUn intento anterior no valía por esto, corrígelo: ${input.fix.join("; ")}.` : "",
    "",
    "Escribe la guía.",
  ].filter(Boolean).join("\n");
  const { output } = await track("guides", input.name, () =>
    generateText({ model: GUIDE_MODEL, output: Output.object({ schema: GuideSchema }), system: SYSTEM.replace("<keyword>", input.keyword), prompt }),
  );
  return { slug: input.slug, keyword: input.keyword, ...output };
}
