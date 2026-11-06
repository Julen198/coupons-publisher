"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateStoreFaqs, removePage, savePage } from "@/app/actions-pages";
import { btnCls, btnSecondaryCls, cardCls } from "@/app/ui";
import type { Delivery } from "@/lib/db";

interface GeneratorProps {
  client: { slug: string; name: string; domain: string };
  store: { slug: string; name: string };
  initialDelivery: Delivery;
  published: boolean;
  exists: boolean;
  readOnly: boolean;
  checks: { ok: boolean; text: string }[];
  faqCount: number;
  autoFaqs: boolean; // just added to the client: write the store's FAQs if it has none
  fromClient: boolean; // keeps "← client" as the back link when ?nueva is dropped
}

const MODES: { id: Delivery; label: string; hint: (domain: string) => string }[] = [
  { id: "widget", label: "Widget embebido", hint: () => "Una línea de script en su artículo. Siempre al día." },
  { id: "html", label: "HTML para su CMS", hint: () => "Descargan el archivo y lo pegan. Hay que volver a exportarlo cada mes." },
];

// window.location.origin without a hydration mismatch (server renders the placeholder)
const useOrigin = () => useSyncExternalStore(() => () => {}, () => window.location.origin, () => "https://[NUESTRO-DOMINIO]");

export function PageGenerator({ client, store, initialDelivery, published, exists, readOnly, checks, faqCount, autoFaqs, fromClient }: GeneratorProps) {
  const [delivery, setDelivery] = useState<Delivery>(initialDelivery);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [copied, setCopied] = useState(false);
  const origin = useOrigin();
  const path = `/p/${client.slug}/${store.slug}`;
  const host = client.domain.replace(/^www\./, "") || "su-dominio.es";
  const [view, setView] = useState<"site" | "module">("site");
  const [faqState, setFaqState] = useState("");
  const [generating, startFaqs] = useTransition();
  const [reloads, setReloads] = useState(0); // bump to reload the preview after content changes
  const router = useRouter();

  // once, on arrival from "+ Añadir tienda", for a store without FAQs; the ref survives the Strict Mode double effect
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoFaqs || readOnly || faqCount > 0 || autoStarted.current) return;
    autoStarted.current = true;
    generateFaqs();
    router.replace(`/panel/pages/${client.slug}/${store.slug}${fromClient ? "?desde=cliente" : ""}`, { scroll: false }); // drop ?nueva so a reload doesn't repeat it
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  function generateFaqs() {
    setFaqState("");
    startFaqs(async () => {
      const r = await generateStoreFaqs(store.slug);
      setFaqState(r.error ?? `${r.count} preguntas guardadas en ${store.name}`);
      if (!r.error) {
        router.refresh();
        setReloads((n) => n + 1);
      }
    });
  }
  // the page dressed as the client's site (their header, menu, font); only once the page exists, else the bare module
  const inSite = view === "site" && exists;
  const previewSrc = inSite ? `/demo/${client.slug}?store=${store.slug}&embed=1` : path;
  const openHref = inSite ? `/demo/${client.slug}?store=${store.slug}` : path; // the link opens what the preview shows

  const output = {
    widget: {
      code: `<script src="${origin}/widget.js"\n  data-client="${client.slug}" data-store="${store.slug}" async></script>`,
      action: "Copiar snippet",
    },
    html: { code: `${client.slug}-${store.slug}.html\nTítulo y cupones congelados en la fecha de exportación.`, action: "" },
  }[delivery];

  async function copy() {
    try {
      await navigator.clipboard.writeText(output.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the text stays visible to copy by hand
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex max-w-md min-w-0 flex-1 basis-80 flex-col gap-5">
        <form action={savePage} className="flex flex-col gap-5">
          <input type="hidden" name="client" value={client.slug} />
          <input type="hidden" name="store" value={store.slug} />
          <fieldset className={`${cardCls} flex flex-col gap-2`}>
            <legend className="px-1 text-sm font-semibold text-neutral-600 dark:text-neutral-400">Cómo le llega al medio</legend>
            {MODES.map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-lg p-3 text-sm ${delivery === m.id ? "border-2 border-blue-700 bg-blue-50 dark:border-blue-400 dark:bg-blue-950" : "border border-neutral-200 dark:border-neutral-800"}`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <input type="radio" name="delivery" value={m.id} checked={delivery === m.id} onChange={() => setDelivery(m.id)} className="size-4" />
                  {m.label}
                </span>
                <span className="pl-6 text-xs text-neutral-600 dark:text-neutral-400">{m.hint(host)}</span>
              </label>
            ))}
            <pre className="mt-2 rounded-md bg-slate-900 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-slate-100">{output.code}</pre>
            {delivery === "html" ? (
              <a href={`${path}?download`} className={`${btnSecondaryCls} min-h-10`}>Descargar HTML</a>
            ) : (
              <button type="button" onClick={copy} className={`${btnSecondaryCls} min-h-10`}>{copied ? "Copiado" : output.action}</button>
            )}
          </fieldset>

          <section aria-labelledby="checks" className={`${cardCls} flex flex-col gap-2 text-sm`}>
            <h2 id="checks" className="mb-1 text-sm font-semibold text-neutral-600 dark:text-neutral-400">Antes de publicar</h2>
            {checks.map((c) => (
              <span key={c.text} className="flex gap-2">
                <span aria-hidden="true" className={`font-bold ${c.ok ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>{c.ok ? "✓" : "!"}</span>
                <span><span className="sr-only">{c.ok ? "Correcto: " : "Atención: "}</span>{c.text}</span>
              </span>
            ))}
            {!readOnly && (
              <div className="mt-2 flex flex-col gap-1.5 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                <button type="button" onClick={generateFaqs} disabled={generating} className={`${btnSecondaryCls} min-h-10 disabled:opacity-60`}>
                  {generating ? "Generando FAQs…" : faqCount ? "✦ Regenerar FAQs con IA" : "✦ Generar FAQs con IA"}
                </button>
                <span role="status" className="text-xs text-neutral-500">
                  {faqState || `Las FAQs son de ${store.name}: valen para todos los medios que la publiquen.`}
                </span>
              </div>
            )}
          </section>

          {!readOnly && <div className="flex flex-wrap gap-2">
            <button name="intent" value="publish" className={`${btnCls} min-h-12 flex-1`}>{published ? "Volver a publicar" : `Publicar para ${client.name}`}</button>
            <button name="intent" value="draft" className={`${btnSecondaryCls} min-h-12`}>{published ? "Pasar a borrador" : "Guardar borrador"}</button>
          </div>}
        </form>
        {exists && !readOnly && (
          <form action={removePage}>
            <input type="hidden" name="client" value={client.slug} />
            <input type="hidden" name="store" value={store.slug} />
            <button className="text-sm text-red-700 hover:underline dark:text-red-400">Quitar esta tienda de {client.name}</button>
          </form>
        )}
      </div>

      <section aria-label="Vista previa" className="flex min-w-0 flex-[999_1_560px] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-slate-100 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
          <a href={openHref} target="_blank" className="min-w-0 flex-1 truncate font-mono text-xs text-blue-700 hover:underline dark:text-blue-300">{origin}{openHref} ↗</a>
          <div role="group" aria-label="Qué ver" className="flex gap-1">
            {(["site", "module"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} disabled={v === "site" && !exists} onClick={() => setView(v)} className={`min-h-9 rounded px-3 text-sm disabled:opacity-40 ${view === v ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}>
                {v === "site" ? `En ${client.name}` : "Solo el módulo"}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Dispositivo" className="flex gap-1">
            {(["desktop", "mobile"] as const).map((d) => (
              <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={`min-h-9 rounded px-3 text-sm ${device === d ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}>
                {d === "desktop" ? "Escritorio" : "Móvil"}
              </button>
            ))}
          </div>
        </div>
        <div className="relative flex justify-center p-4">
          <iframe key={reloads} title={`Página de ${store.name} para ${client.name}`} src={previewSrc} aria-busy={generating} className={`h-[820px] rounded bg-white shadow transition-opacity ${generating ? "opacity-40" : ""}`} style={{ width: device === "mobile" ? 390 : "100%" }} />
          {generating && <FaqProgress storeName={store.name} />}
        </div>
      </section>
    </div>
  );
}

// Over the preview while the AI writes the FAQs: what is happening, and the shape of what is coming
function FaqProgress({ storeName }: { storeName: string }) {
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 flex items-start justify-center p-4 pt-24">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-blue-200 bg-white/95 p-6 shadow-xl backdrop-blur dark:border-blue-900 dark:bg-neutral-900/95">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-blue-700 motion-safe:animate-spin dark:text-blue-400" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div className="flex flex-col">
            <span className="font-semibold">Escribiendo las preguntas frecuentes de {storeName}…</span>
            <span className="text-sm text-neutral-600 dark:text-neutral-400">La IA lee sus cupones y redacta la intro y las FAQs. Tarda unos segundos.</span>
          </div>
        </div>
        <div className="flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1.5 motion-safe:animate-pulse" style={{ animationDelay: `${i * 150}ms` }}>
              <span className="h-3.5 w-3/4 rounded bg-blue-100 dark:bg-blue-950" />
              <span className="h-2.5 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
              <span className="h-2.5 w-5/6 rounded bg-neutral-200 dark:bg-neutral-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
