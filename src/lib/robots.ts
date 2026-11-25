// robots.txt: only the public deals site is for search engines (every URL the sitemap lists, plus the assets and
// images those pages load). The panel, APIs, /go redirects, reader flows and clients' pages stay out.
const ALLOW = ["/$", "/chollos/", "/tiendas", "/categorias/", "/ofertas/", "/calendario", "/metodologia", "/aviso-de-afiliacion", "/aviso-legal", "/asistentes-ia", "/privacidad-asistentes", "/condiciones-de-uso", "/contacto", "/sitemap.xml", "/llms.txt", "/indexnow.txt", "/icon.svg", "/_next/static/", "/_next/image", "/store-logo/", "/opengraph-image"];
const DISALLOW = ["/panel", "/api/", "/go/", "/entrar", "/compartir", "/cuenta", "/login", "/invite/", "/"];

export function robotsTxt(base: string): string {
  return ["User-agent: *", ...ALLOW.map((p) => `Allow: ${p}`), ...DISALLOW.map((p) => `Disallow: ${p}`), "", `Sitemap: ${base}/sitemap.xml`, ""].join("\n");
}
