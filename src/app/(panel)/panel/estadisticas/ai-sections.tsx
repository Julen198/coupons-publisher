import { cardCls } from "@/app/ui";
import { SOURCE_LABEL } from "@/lib/click-signals";
import { BOT_KIND_LABEL, type BotKind } from "@/lib/ai-traffic";
import type { Stats } from "@/lib/stats";

// The parts of Estadísticas for Bing and the AI assistants: the two search engines side by side, visits each assistant
// sends (GA4), AI bots reading the site, the MCP server and the link to Bing's Copilot citations.

const n = (v: number) => Math.round(v).toLocaleString("es-ES");
const pct = (v: number) => `${(v * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const pos = (v: number | null) => (v == null ? "—" : v.toLocaleString("es-ES", { maximumFractionDigits: 1 }));
const th = "px-3 py-2 font-semibold";
const td = "px-3 py-2 text-right tabular-nums";

function Change({ cur, prev }: { cur: number; prev: number }) {
  if (!prev) return <span className="text-xs text-neutral-500">{cur ? "nuevo" : "—"}</span>;
  const up = cur >= prev;
  return <span className={`text-xs font-semibold ${up ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{up ? "▲" : "▼"} {Math.abs(Math.round(((cur - prev) / prev) * 100))} %</span>;
}

function Engine({ name, src, dot, impressions, clicks, position, note }: { name: string; src: string; dot: string; impressions: number | null; clicks: number | null; position: number | null; note: string }) {
  const cells: [string, string][] = [
    ["Impresiones", impressions == null ? "—" : n(impressions)],
    ["Clics", clicks == null ? "—" : n(clicks)],
    ["CTR", impressions ? pct((clicks ?? 0) / impressions) : "—"],
    ["Posición", pos(position)],
  ];
  return (
    <div className={`${cardCls} flex flex-col gap-3`}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`size-2.5 rounded-sm ${dot}`} />
        <h3 className="font-semibold">{name}</h3>
        <span className="text-xs text-neutral-500">{src}</span>
      </div>
      <dl className="grid grid-cols-4 gap-2">
        {cells.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5"><dt className="text-xs text-neutral-500">{k}</dt><dd className="text-xl font-bold tabular-nums">{v}</dd></div>
        ))}
      </dl>
      <p className="text-xs text-neutral-500">{note}</p>
    </div>
  );
}

export function Engines({ s }: { s: Stats }) {
  const near = s.queries.filter((q) => q.position >= 8 && q.position <= 30).length;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
      <Engine name="Google" src="Search Console" dot="bg-blue-700 dark:bg-blue-400" impressions={s.sources.search.ok ? s.cur.impressions : null} clicks={s.sources.search.ok ? s.cur.gClicks : null} position={s.cur.position}
        note={s.sources.search.ok ? `${n(near)} búsquedas cerca de la primera página (posición 8–30).` : "Sin datos de Search Console."} />
      <Engine name="Bing" src="Bing Webmaster" dot="bg-teal-700 dark:bg-teal-400" impressions={s.cur.bImpressions} clicks={s.cur.bClicks} position={s.bing.position}
        note={s.sources.bing.ok
          ? `Es el índice en el que busca ChatGPT. ${n(s.bing.better)} búsquedas en las que Bing nos pone mejor que Google. Bing da las búsquedas por semanas: la posición sale de las semanas que acaban en el periodo.`
          : `Sin datos de Bing (${s.sources.bing.note}). Falta la clave BING_WEBMASTER_API_KEY en Vercel.`} />
    </div>
  );
}

export function Assistants({ s }: { s: Stats }) {
  const top = Math.max(1, ...s.assistants.map((a) => a.visits));
  return (
    <section aria-labelledby="assistants" className="min-w-0 flex-[1_1_320px] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <h3 id="assistants" className="font-semibold">Visitas que manda cada asistente</h3>
        <p className="text-xs text-neutral-500">GA4, por el origen de la visita (chatgpt.com, perplexity.ai…)</p>
      </div>
      {!s.sources.ga4.ok && <p className="px-5 py-6 text-sm text-neutral-500">Sin datos de Google Analytics.</p>}
      {s.sources.ga4.ok && s.assistants.length === 0 && <p className="px-5 py-6 text-sm text-neutral-500">Ningún asistente ha mandado visitas en este periodo.</p>}
      {s.assistants.map((a) => (
        <div key={a.name} className="grid grid-cols-[100px_1fr_48px_56px] items-center gap-3 border-t border-neutral-100 px-5 py-2.5 text-sm first:border-t-0 dark:border-neutral-800">
          <span className="font-medium">{a.name}</span>
          <span className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800"><span className="block h-2 rounded-full bg-blue-700 dark:bg-blue-400" style={{ width: `${(a.visits / top) * 100}%` }} /></span>
          <span className="text-right tabular-nums">{n(a.visits)}</span>
          <span className="text-right"><Change cur={a.visits} prev={a.prev} /></span>
        </div>
      ))}
    </section>
  );
}

const KIND_CLS: Record<BotKind, string> = {
  live: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  search: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  training: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

export function Bots({ s }: { s: Stats }) {
  return (
    <section aria-labelledby="bots" className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <div>
          <h3 id="bots" className="font-semibold">Bots de IA y buscadores que leen la web</h3>
          <p className="text-xs text-neutral-500">Contados por la propia web, sin IP. «En directo» es alguien preguntando a ese asistente en ese momento.</p>
        </div>
        <span className="flex flex-wrap gap-2 text-xs">
          {(Object.keys(BOT_KIND_LABEL) as BotKind[]).map((k) => <span key={k} className={`rounded-full px-2 py-0.5 font-semibold ${KIND_CLS[k]}`}>{BOT_KIND_LABEL[k]}</span>)}
        </span>
      </div>
      {!s.sources.bots.ok ? (
        <p className="px-5 py-6 text-sm text-neutral-500">Aún no se cuentan: {s.sources.bots.note}.</p>
      ) : s.bots.length === 0 ? (
        <p className="px-5 py-6 text-sm text-neutral-500">Ningún bot ha leído la web en este periodo (o se empezó a contar hace poco).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
              <tr><th className={`${th} pl-5`}>Bot</th><th className={th}>De quién</th><th className={th}>Para qué</th><th className={`${th} text-right`}>Páginas leídas</th><th className={`${th} text-right`}>vs. anterior</th><th className={`${th} pr-5`}>La que más lee</th></tr>
            </thead>
            <tbody>
              {s.bots.map((b) => (
                <tr key={b.bot} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-3 py-2 pl-5 font-mono text-xs font-semibold">{b.bot}</td>
                  <td className="px-3 py-2">{b.who}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_CLS[b.kind]}`}>{BOT_KIND_LABEL[b.kind]}</span></td>
                  <td className={td}>{n(b.hits)}</td>
                  <td className="px-3 py-2 text-right"><Change cur={b.hits} prev={b.prev} /></td>
                  <td className="max-w-64 truncate px-3 py-2 pr-5 text-neutral-500" title={b.top}>{b.top}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function Mcp({ s }: { s: Stats }) {
  const m = s.mcp;
  return (
    <section aria-labelledby="mcp" className="min-w-0 flex-[1_1_380px] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <h3 id="mcp" className="font-semibold">Servidor MCP</h3>
        <p className="text-xs text-neutral-500">Lo que piden Claude, ChatGPT y otros asistentes a www.cuponlab.com/mcp</p>
      </div>
      {!s.sources.mcp.ok ? (
        <p className="px-5 py-6 text-sm text-neutral-500">Aún no se cuentan las consultas: {s.sources.mcp.note}. Los clics que salen del MCP sí: {n(m.clicks)} en este periodo.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 px-5 py-4">
            <div><p className="text-2xl font-bold tabular-nums">{n(m.calls)}</p><p className="text-xs text-neutral-500">Consultas · <Change cur={m.calls} prev={m.prevCalls} /></p></div>
            <div><p className="text-2xl font-bold tabular-nums">{n(m.clicks)}</p><p className="text-xs text-neutral-500">Clics a tienda</p></div>
            <div><p className="text-2xl font-bold tabular-nums">{m.calls ? pct(m.clicks / m.calls) : "—"}</p><p className="text-xs text-neutral-500">Acaban en clic</p></div>
          </div>
          {m.top.length > 0 && <p className="px-5 pb-1 text-xs font-semibold text-neutral-500">Lo más pedido</p>}
          {m.top.map((q) => (
            <div key={q.query} className="grid grid-cols-[1fr_auto_48px] gap-3 border-t border-neutral-100 px-5 py-2 text-sm dark:border-neutral-800">
              <span className="truncate font-medium" title={q.query}>{q.query}</span>
              <span className="text-neutral-500">{SOURCE_LABEL[q.source]?.replace(" (MCP)", "") ?? q.source}</span>
              <span className="text-right tabular-nums">{n(q.n)}</span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

export function CopilotLink() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-neutral-300 px-5 py-4 dark:border-neutral-700">
      <div>
        <p className="font-semibold">Citas en Copilot y en los resúmenes de Bing</p>
        <p className="text-sm text-neutral-500">Bing aún no da este informe por API: se ve en su web, en AI Performance.</p>
      </div>
      <a href="https://www.bing.com/webmasters/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">Abrir Bing Webmaster</a>
    </div>
  );
}
