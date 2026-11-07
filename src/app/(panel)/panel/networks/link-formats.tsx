import Link from "next/link";
import type { Client, Coupon, Store } from "@/lib/db";
import { couponAffiliateUrl } from "@/lib/render-page";
import { ADAPTERS } from "@/lib/networks/index";
import { cardCls } from "@/app/ui";

// How each network's link is put together, in words a non-developer can follow.
// <placeholders> are highlighted; the real link below is built by the same code the /go redirect uses.
const FORMATS: Record<string, { format: string; affiliate: string }> = {
  awin: {
    format: "https://www.awin1.com/cread.php?awinmid=<anunciante>&awinaffid=<ID de afiliado>&clickref=<ref>&ued=<destino>",
    affiliate: "El Publisher ID de la cuenta de Awin asignada al medio en Conectar redes; si no tiene, el de nuestra cuenta que importó el cupón",
  },
  tradedoubler: {
    format: "https://clk.tradedoubler.com/click?p=<programa>&a=<ID de sitio>&epi=<ref>&url=<destino>",
    affiliate: "Nuestro ID de sitio, sacado del enlace que da la API al sincronizar",
  },
  admitad: {
    format: "https://ad.admitad.com/goto/<código del espacio>/?subid=<ref>&ulp=<destino>",
    affiliate: "Va dentro del código del enlace que da la API (por espacio publicitario)",
  },
  webgains: {
    format: "https://track.webgains.com/click.html?wgcampaignid=<Campaign ID>&wgprogramid=<programa>&clickref=<ref>&wgtarget=<destino>",
    affiliate: "Nuestro Campaign ID de la cuenta conectada",
  },
  cj: {
    format: "https://www.anrdoezrs.net/click-<ID de sitio (PID)>-<anuncio>?sid=<ref>&url=<destino>",
    affiliate: "El PID de la cuenta de CJ, ya dentro del enlace que da la API",
  },
  rakuten: {
    format: "https://click.linksynergy.com/deeplink?id=<ID cifrado del publisher>&mid=<anunciante>&u1=<ref>&murl=<destino>",
    affiliate: "El id cifrado de nuestro SID, sacado de los enlaces de los cupones",
  },
  impact: {
    format: "https://<dominio de la marca>/c/<ID de partner>/<anuncio>/<campaña>?subId1=<ref>&u=<destino>",
    affiliate: "Va dentro del enlace de seguimiento de cada campaña (por cuenta)",
  },
  adtraction: {
    format: "https://track.adtraction.com/t/t?a=<anuncio>&as=<ID del canal>&t=2&tk=1&epi=<ref>&url=<destino>",
    affiliate: "El ID del canal de la cuenta conectada, ya dentro del enlace que da la API",
  },
  effiliation: {
    format: "https://track.effiliation.com/servlet/effi.redir?id_compteur=<contador del programa>&effi_id=<ref>&url=<destino>",
    affiliate: "Va dentro del contador de cada programa (por cuenta)",
  },
  kwanko: {
    format: "https://action.metaffiliation.com/trk.php?mclic=<enlace del sitio>&redir=<destino>&argsite=<ref>",
    affiliate: "Va dentro del enlace profundo que da la API por sitio",
  },
  affilae: {
    format: "<destino>?ae=<ID de seguimiento>&aev=<ref>",
    affiliate: "El ID de seguimiento de la colaboración; solo para programas con enlaces por parámetro",
  },
  partnerize: {
    format: "https://prf.hn/click/camref:<camref>/pubref:<ref>/destination:<destino>",
    affiliate: "El camref de cada campaña, por cuenta",
  },
};

export interface LinkExample {
  network: string;
  store: Store;
  coupon: Pick<Coupon, "id" | "target_url" | "title" | "publisher_id">;
}

function Template({ text }: { text: string }) {
  return (
    <code className="block break-all rounded-md bg-neutral-50 p-3 font-mono text-xs leading-relaxed dark:bg-neutral-900">
      {text.split(/(<[^>]+>)/).map((part, i) =>
        part.startsWith("<") ? <span key={i} className="rounded bg-indigo-100 px-1 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">{part.slice(1, -1)}</span> : part,
      )}
    </code>
  );
}

export function LinkFormats({ clients, examples, ourIds }: { clients: Client[]; examples: LinkExample[]; ourIds: Record<string, string> }) {
  const sample = clients.find((c) => c.awin_affiliate_id) ?? clients[0];
  const ref = (c: Client) => [c.clickref_prefix || "<prefijo>", "<tienda>", "<cupón>"].join("-");
  return (
    // reference material, folded away so the accounts stay the focus of the page
    <details className="group rounded-lg border border-neutral-200 dark:border-neutral-800">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-full border border-neutral-400 text-xs text-neutral-500">i</span>
        Cómo se construyen los enlaces
        <span aria-hidden className="ml-auto text-neutral-500 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <section aria-label="Cómo se construyen los enlaces" className="flex flex-col gap-4 border-t border-neutral-200 p-5 dark:border-neutral-800">
        <div>
          <p className="max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">
            El panel monta cada enlace con el formato de su red. Todos llevan un <strong>ref</strong> = prefijo del medio · tienda · cupón,
            para ver en los informes de la red qué medio, tienda y cupón generó cada venta. Antes de ir a la red, el clic pasa por nuestro
            servidor para contarlo en Clics.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {ADAPTERS.map((a) => {
            const f = FORMATS[a.id];
            if (!f) return null;
            const ex = examples.find((e) => e.network === a.id);
            return (
              <article key={a.id} className={`${cardCls} flex min-w-0 flex-col gap-2`}>
                <h3 className="font-semibold">{a.label}</h3>
                <Template text={f.format} />
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-neutral-500">ID de afiliado</dt>
                  <dd>{f.affiliate}</dd>
                  {ourIds[a.id] && (
                    <>
                      <dt className="text-neutral-500">Nuestro ID</dt>
                      <dd className="font-mono">{ourIds[a.id]}</dd>
                    </>
                  )}
                </dl>
                {ex && sample ? (
                  <div className="flex flex-col gap-1 text-sm">
                    <span className="text-neutral-500">
                      Ejemplo real: {ex.store.name} · «{ex.coupon.title}» en {sample.name}
                    </span>
                    <code className="block break-all rounded-md border border-neutral-200 p-2 font-mono text-xs dark:border-neutral-800">
                      {couponAffiliateUrl(sample, ex.store, ex.coupon)}
                    </code>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">Aún no hay tiendas con cupones de esta red para enseñar un ejemplo.</p>
                )}
              </article>
            );
          })}
        </div>

        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <caption className="border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-left font-semibold dark:border-neutral-800 dark:bg-neutral-900">IDs por medio</caption>
            <thead className="text-left text-neutral-500">
              <tr>
                <th scope="col" className="px-5 py-2 font-medium">Medio</th>
                <th scope="col" className="px-5 py-2 font-medium">ref de sus enlaces</th>
                <th scope="col" className="px-5 py-2 font-medium">Awin affiliate ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-2"><Link href={`/panel/clients/${c.slug}`} className="hover:underline">{c.name}</Link></td>
                  <td className="px-5 py-2 font-mono text-xs">{ref(c)}</td>
                  <td className="px-5 py-2">
                    {c.awin_affiliate_id ? (
                      <span className="font-mono">{c.awin_affiliate_id}</span>
                    ) : (
                      <span className="text-neutral-500">Nuestras cuentas (la que importó cada cupón)</span>
                    )}
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr><td colSpan={3} className="px-5 py-4 text-neutral-500">Aún no hay medios.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </details>
  );
}
