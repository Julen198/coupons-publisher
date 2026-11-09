// What every published guide gets without anyone doing anything (SEO for Google, GEO for AI assistants): links from
// other pages, a ping to IndexNow and a line in /llms.txt (the store page already opens with an answer-first line). Pure; the queries are in
// guide-index.ts and the pages/routes that use them.

export interface GuideLink { slug: string; name: string; keyword: string; description: string; category: string; updatedAt: Date | null }

// The other guides to link from one guide: same category first, then the freshest
export function relatedGuides(all: readonly GuideLink[], slug: string, category: string, limit = 4): GuideLink[] {
  const time = (x: GuideLink) => x.updatedAt?.getTime() ?? 0;
  return all
    .filter((x) => x.slug !== slug)
    .sort((a, b) => Number(b.category === category && !!category) - Number(a.category === category && !!category) || time(b) - time(a))
    .slice(0, limit);
}

// IndexNow (Bing, Yandex, Seznam, Naver…; Bing feeds ChatGPT search and Copilot). The key is public by design: it is
// served at /indexnow.txt so engines can check the ping comes from the site's owner.
export const INDEXNOW_KEY = "d733bec55966388a5a337623515ca1d7";

export function indexNowRequest(base: string, paths: readonly string[]) {
  const host = new URL(base).host;
  return {
    url: "https://api.indexnow.org/indexnow",
    body: { host, key: INDEXNOW_KEY, keyLocation: `${base}/indexnow.txt`, urlList: paths.map((p) => `${base}${p}`) },
  };
}

// /llms.txt (llmstxt.org): what the site is and its most useful pages, for AI assistants that read it
export function llmsTxt(base: string, guides: readonly GuideLink[], stores: readonly { slug: string; name: string; live: number }[]): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return [
    "# CuponLab",
    "",
    "> Códigos descuento y chollos verificados de tiendas online en España. Cada cupón se comprueba antes de publicarlo, los caducados se retiran solos y cada tienda tiene su página con los códigos activos hoy.",
    "",
    "## Guías de tiendas",
    "",
    ...(guides.length ? guides.map((g) => `- [${cap(g.keyword)}](${base}/tiendas/${g.slug}): ${g.description}`) : ["- Todavía no hay guías publicadas."]),
    "",
    "## Tiendas con más cupones",
    "",
    ...stores.map((s) => `- [${s.name}](${base}/tiendas/${s.slug}): ${s.live} ${s.live === 1 ? "cupón activo" : "cupones activos"}`),
    "",
    "## Sobre CuponLab",
    "",
    `- [Cómo comprobamos cada cupón](${base}/metodologia)`,
    `- [Aviso de afiliación](${base}/aviso-de-afiliacion)`,
    `- [Todas las tiendas](${base}/tiendas)`,
    `- [Calendario de ofertas](${base}/calendario)`,
    "",
  ].join("\n");
}
