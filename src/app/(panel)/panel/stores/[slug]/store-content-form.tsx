"use client";

import { useActionState, useState, useTransition } from "react";
import { updateStore, type FormState } from "@/app/actions";
import { generateContent } from "@/app/actions-pages";
import { pageTitle, parseFaqs } from "@/lib/affiliate";
import { CATEGORIES, factsOf } from "@/lib/catalog";
import { btnCls, btnSecondaryCls, cardCls, Field, inputCls } from "@/app/ui";
import { NetworkFields } from "../network-fields";

interface StoreContentProps {
  store: { slug: string; name: string; website: string; network: string; merchant_id: string; tracking_url: string; intro: string; faqs: string; category: string; facts: string };
  discounts: string[];
}

export function StoreContentForm({ store, discounts }: StoreContentProps) {
  const [intro, setIntro] = useState(store.intro);
  const [faqs, setFaqs] = useState(store.faqs);
  // controlled: a form action resets uncontrolled fields to their first value, and the next save would send that
  const [category, setCategory] = useState(store.category);
  const [facts, setFacts] = useState(store.facts);
  const [aiError, setAiError] = useState("");
  const [generating, startGenerate] = useTransition();
  const [, startSave] = useTransition();
  const [state, formAction, saving] = useActionState<FormState & { saved?: boolean }, FormData>(
    async (prev, f) => ({ ...(await updateStore(prev, f)), saved: true }),
    {},
  );

  function generate() {
    setAiError("");
    startGenerate(async () => {
      const out = await generateContent(store.slug);
      if (out.error) return setAiError(out.error);
      setIntro(out.intro ?? intro);
      setFaqs(out.faqs ?? faqs);
    });
  }

  const parsed = parseFaqs(faqs);

  return (
    <div className="flex flex-wrap items-start gap-6">
      {/* submitted by hand: a form `action` makes React reset the form afterwards, which puts the <select> and the
          defaultValue inputs back to their first values while the store already holds the new ones */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startSave(() => formAction(data));
        }}
        className={`${cardCls} flex min-w-0 flex-[999_1_480px] flex-col gap-4`}
      >
        <input type="hidden" name="slug" value={store.slug} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Web" name="website" type="url" required defaultValue={store.website} />
          <NetworkFields network={store.network} merchantId={store.merchant_id} trackingUrl={store.tracking_url} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-600 dark:text-neutral-400">Categoría</span>
            <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              <option value="">Sin categoría</option>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <div>
            <h2 className="font-semibold">Texto de la página</h2>
            <p className="text-sm text-neutral-500">La IA lo escribe a partir de los cupones actuales. Revísalo antes de guardar.</p>
          </div>
          <button type="button" onClick={generate} disabled={generating} className={`${btnSecondaryCls} min-h-10 disabled:opacity-50`}>
            {generating ? "Generando…" : "✦ Generar con IA"}
          </button>
        </div>
        {aiError && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{aiError}</p>}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Intro</span>
          <textarea name="intro" rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} className={inputCls} aria-busy={generating} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">FAQs — una por línea: Pregunta | Respuesta</span>
          <textarea name="faqs" rows={8} value={faqs} onChange={(e) => setFaqs(e.target.value)} className={`${inputCls} font-mono text-xs`} aria-busy={generating} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Datos de la tienda. Una línea por dato: Envío | Gratis desde 50 €</span>
          <textarea name="facts" rows={4} value={facts} onChange={(e) => setFacts(e.target.value)} className={`${inputCls} font-mono text-xs`} aria-describedby="facts-count" />
          <span id="facts-count" className="text-xs text-neutral-600 dark:text-neutral-400">Datos válidos · {factsOf(facts).length}. Las líneas sin «|» no se muestran.</span>
        </label>

        {state.error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{state.error}</p>}
        <div className="flex items-center gap-3">
          <button disabled={saving} className={`${btnCls} min-h-11 disabled:opacity-50`}>{saving ? "Guardando…" : "Guardar contenido"}</button>
          {state.saved && !state.error && !saving && <span role="status" className="text-sm text-green-700 dark:text-green-400">Guardado</span>}
        </div>
      </form>

      <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
        <section aria-labelledby="serp" className={`${cardCls} flex flex-col gap-2`}>
          <h2 id="serp" className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">Así sale en Google (este mes)</h2>
          <div className="flex flex-col gap-1 rounded-md bg-white p-3 text-neutral-900">
            <span className="text-xs text-neutral-600">cupones.tu-medio.es › {store.name.toLowerCase()}</span>
            <span className="text-lg leading-snug text-[#1a0dab]">{pageTitle(store.name, discounts, new Date())}</span>
            <span className="text-sm text-neutral-700">{`Códigos descuento ${store.name} verificados y actualizados. ${intro}`.slice(0, 160)}</span>
          </div>
          <span className="text-xs text-neutral-500">El mes y los 2 mejores descuentos se actualizan solos.</span>
        </section>
        <section aria-labelledby="faq-prev" className={`${cardCls} flex flex-col gap-2`}>
          <h2 id="faq-prev" className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">FAQs válidas · {parsed.length}</h2>
          {parsed.map((f) => (
            <div key={f.q} className="border-t border-neutral-100 pt-2 text-sm first-of-type:border-0 dark:border-neutral-800">
              <p className="font-medium">{f.q}</p>
              <p className="text-neutral-600 dark:text-neutral-400">{f.a}</p>
            </div>
          ))}
        </section>
      </aside>
    </div>
  );
}
