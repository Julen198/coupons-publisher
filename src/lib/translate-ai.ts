// One AI call per batch of coupons (up to TRANSLATE_BATCH): Spanish title and conditions, every item checked against
// its source (checkTranslation). No Next imports, so scripts/translate-coupons.ts can use it under plain node.
import { generateText, Output } from "ai";
import { z } from "zod";
import { MODEL } from "./ai-model.ts";
import { usageOf } from "./ai-costs.ts";
import { checkTranslation, TRANSLATE_BATCH, TRANSLATION_SYSTEM, translationInput, type TranslationSource } from "./translation.ts";

const TranslationSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().describe("El id recibido"),
      title_es: z.string().describe("El título en español de España"),
      description_es: z.string().describe("Las condiciones en español de España; vacío si llegaron vacías"),
    }),
  ),
});

export type Translated = { id: number; title_es: string; description_es: string };
export type BatchResult = { translated: Translated[]; rejected: { id: number; reason: string }[]; usage: ReturnType<typeof usageOf> };

export const NO_USAGE: BatchResult["usage"] = { input: 0, output: 0, searches: 0, cost: 0, gatewayCost: 0 };

export async function translateBatch(items: readonly TranslationSource[]): Promise<BatchResult> {
  if (items.length > TRANSLATE_BATCH) throw new Error(`Como mucho ${TRANSLATE_BATCH} cupones por llamada`);
  if (!items.length) return { translated: [], rejected: [], usage: NO_USAGE };
  const result = await generateText({
    model: MODEL,
    output: Output.object({ schema: TranslationSchema }),
    system: TRANSLATION_SYSTEM,
    prompt: `Cupones (JSON con id, title y description):\n${translationInput(items)}\n\nTradúcelos.`,
  });
  const byId = new Map(result.output.items.map((it) => [it.id, it]));
  const translated: Translated[] = [];
  const rejected: { id: number; reason: string }[] = [];
  for (const src of items) {
    const out = byId.get(src.id);
    const checked = out ? checkTranslation(src, out) : ({ ok: false, reason: "sin respuesta" } as const);
    if (checked.ok) translated.push({ id: src.id, title_es: checked.title_es, description_es: checked.description_es });
    else rejected.push({ id: src.id, reason: checked.reason });
  }
  return { translated, rejected, usage: usageOf(result.steps) };
}
