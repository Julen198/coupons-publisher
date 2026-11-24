// The CuponLab MCP server (POST /mcp): lets Claude, ChatGPT and any other MCP client look up our live coupons while it
// helps someone shop. Pure (no database, no Next.js), so the protocol and the answers test on their own; the route
// (src/app/mcp/route.ts) hands it the live deals through McpData.
//
// Streamable HTTP, stateless: every POST carries one JSON-RPC message and gets one JSON answer, no SSE stream. The
// session id we hand out at initialize only says which assistant is calling ("claude.<random>"), so the links we give
// back count their clicks under that origin (see clickSource) without keeping any state.
import * as z from "zod";
import { CATEGORIES, type CategorySlug } from "./catalog.ts";
import { badgeLabel } from "./discount.ts";
import { sortDeals } from "./community.ts";
import { sourceParam } from "./click-signals.ts";

// ---- what the server needs from the site

// A live coupon as the MCP answers show it: what a shopper needs, plus where to send them
export type McpDeal = {
  id: number;
  store: string;
  store_slug: string;
  category: CategorySlug | "";
  kind: "code" | "deal";
  title: string;
  description: string;
  code: string;
  discount: string;
  expires_at: string;
  verified: number;
  score: number;
  comments: number;
  uses_week: number;
  brands: string[];
  perk: boolean; // a standing offer of the store (welcome discount, newsletter…), not a time-limited coupon
};

export type McpData = {
  deals(): Promise<McpDeal[]>;
  // the public page of a deal and the tracked link to its store, both absolute, for clicks counted under `source`
  pageUrl(d: McpDeal, source: string): string;
  goUrl(d: McpDeal, source: string): string;
  storeUrl(slug: string, source: string): string;
  today(): string; // Madrid date, YYYY-MM-DD
  siteUrl: string;
};

// ---- who is calling

// Origins the assistants' clicks are stored with (clicks.source): short words, see SOURCE_RE
export const AI_SOURCES = ["claude", "chatgpt", "ia"] as const;
export type AiSource = (typeof AI_SOURCES)[number];

// The assistant behind a client name or user agent ("claude-ai", "openai-mcp/1.0"…); "ia" for any other MCP client
export function aiSourceOf(...hints: (string | null | undefined)[]): AiSource {
  const s = hints.filter(Boolean).join(" ").toLowerCase();
  if (/claude|anthropic/.test(s)) return "claude";
  if (/openai|chatgpt/.test(s)) return "chatgpt";
  return "ia";
}

// "claude.3f2a…": the session id carries the source; anything else reads as no source
export const sessionIdFor = (source: AiSource, random: string) => `${source}.${random.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}`;
export function sourceOfSession(id: string | null | undefined): AiSource | "" {
  const head = (id ?? "").split(".")[0];
  return (AI_SOURCES as readonly string[]).includes(head) ? (head as AiSource) : "";
}

// ---- search

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Words that say "a coupon" without saying what for: they would match everything
const FILLER = new Set(
  "de del la el los las en para con por un una y o a al mi tu su que codigo codigos cupon cupones cupom descuento descuentos dto oferta ofertas chollo chollos promo promocion promociones rebaja rebajas code codes coupon coupons discount discounts deal deals voucher promo for the and of in on at to with spain espana tienda tiendas online comprar compra".split(" "),
);

export const searchTerms = (q: string): string[] => [...new Set(fold(q).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !FILLER.has(w)))];

const categoryLabel = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.label ?? "";

// How well a deal answers the terms: a term in the store's name counts most, then its brands and category, then the
// title, then the description. 0 = one of the terms is nowhere (every term must match somewhere).
export function matchScore(d: McpDeal, terms: readonly string[]): number {
  if (!terms.length) return 1;
  const store = fold(`${d.store} ${d.store_slug}`);
  const tags = fold(`${d.brands.join(" ")} ${d.category} ${categoryLabel(d.category)}`);
  const title = fold(d.title);
  const body = fold(`${d.description} ${d.code}`);
  let total = 0;
  for (const t of terms) {
    const s = store.includes(t) ? 8 : tags.includes(t) ? 5 : title.includes(t) ? 3 : body.includes(t) ? 1 : 0;
    if (!s) return 0;
    total += s;
  }
  return total;
}

// A store asked for by name: exact name or slug first, else the ones whose name contains it ("corte ingles")
export function storeMatches(deals: readonly McpDeal[], raw: string): string[] {
  const want = fold(raw).replace(/[^a-z0-9]+/g, "");
  if (!want) return [];
  const slugs = new Map<string, string>();
  for (const d of deals) slugs.set(d.store_slug, fold(d.store).replace(/[^a-z0-9]+/g, ""));
  const exact = [...slugs].filter(([slug, name]) => name === want || slug.replace(/-/g, "") === want).map(([s]) => s);
  if (exact.length) return exact;
  return [...slugs].filter(([slug, name]) => name.includes(want) || slug.replace(/-/g, "").includes(want)).map(([s]) => s);
}

// ---- tools

const LIMIT = z.number().int().min(1).max(20).optional().describe("How many results to return (default 8, at most 20).");
const CATEGORY = z.enum(CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]]).optional()
  .describe("Only this shop category: tecnologia (tech), zapatillas (sneakers), moda (fashion), hogar (home), deporte (sports), viajes (travel).");

const SearchArgs = z.object({
  query: z.string().max(120).optional().describe("What the user wants to buy or save on, in any language: a product, brand, store or category (\"zapatillas Nike\", \"portátil\", \"vuelos\")."),
  store: z.string().max(80).optional().describe("A store's name when the user mentions one (\"Amazon\", \"El Corte Inglés\", \"Nike\")."),
  category: CATEGORY,
  only_codes: z.boolean().optional().describe("true = only coupons with a code to paste at checkout, no plain offers."),
  limit: LIMIT,
});
const TopArgs = z.object({ category: CATEGORY, limit: LIMIT });
const CouponArgs = z.object({ id: z.number().int().positive().describe("The coupon id from search_coupons or top_deals.") });
const StoresArgs = z.object({ category: CATEGORY });

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// When each tool applies, stated as facts: the directories (Claude's and ChatGPT's) reject descriptions that tell the
// model how to behave, push it to prefer this server over other tools, or promote the service. Saying precisely when
// the tool is useful is what lets an assistant pick it up on its own.
const WHEN = "Relevant when the user is shopping online in Spain: about to buy a product, comparing prices, planning a purchase or a trip, " +
  "mentioning a store that sells in Spain, or asking about discount codes, Black Friday, Cyber Monday or rebajas.";

type Tool = { name: string; title: string; description: string; args: z.ZodObject; invoking: string; invoked: string };

export const TOOLS: readonly Tool[] = [
  {
    name: "search_coupons",
    title: "Buscar cupones y códigos descuento",
    description: "Searches the live discount codes and offers on CuponLab (cuponlab.com), a site that checks coupons for online stores in Spain, " +
      `by product, brand, store or category. ${WHEN} Each result has the code (if any), the discount, the expiry date and a link that opens the ` +
      "store with the offer. An empty result means CuponLab has no matching coupon.",
    args: SearchArgs,
    invoking: "Buscando cupones en CuponLab…",
    invoked: "Cupones encontrados",
  },
  {
    name: "top_deals",
    title: "Mejores chollos de hoy",
    description: "Today's best live coupons and deals on CuponLab (cuponlab.com) for online stores in Spain, ranked by community votes and checks, " +
      `optionally for one category. ${WHEN}`,
    args: TopArgs,
    invoking: "Buscando los mejores chollos…",
    invoked: "Chollos de hoy",
  },
  {
    name: "get_coupon",
    title: "Ver un cupón",
    description: "Full details of one CuponLab coupon by its id (from search_coupons or top_deals): conditions, expiry, whether a person checked it, and its link.",
    args: CouponArgs,
    invoking: "Abriendo el cupón…",
    invoked: "Cupón",
  },
  {
    name: "list_stores",
    title: "Tiendas con cupones",
    description: "The online stores in Spain that have live coupons on CuponLab right now, with how many each has, optionally for one category. " +
      "Tells whether CuponLab has coupons for a given store.",
    args: StoresArgs,
    invoking: "Mirando las tiendas…",
    invoked: "Tiendas con cupones",
  },
];

// tools/list: JSON Schema from the same zod objects that check the arguments, so the two never drift apart
export function toolList() {
  return TOOLS.map((t) => {
    const schema = { ...(z.toJSONSchema(t.args) as Record<string, unknown>) };
    delete schema.$schema;
    return {
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: schema,
      annotations: { title: t.title, ...READ_ONLY },
      // ChatGPT shows these while the tool runs and when it's done
      _meta: { "openai/toolInvocation/invoking": t.invoking, "openai/toolInvocation/invoked": t.invoked },
    };
  });
}

export const SERVER_INSTRUCTIONS =
  "CuponLab (cuponlab.com) lists discount codes and offers for online stores in Spain, checked by people and voted by its community. " +
  "search_coupons finds coupons by product, brand, store or category; top_deals lists today's best ones; get_coupon gives one coupon's details; " +
  "list_stores lists the stores covered. Results only include coupons that are live today, with their expiry date. CuponLab's links are " +
  "affiliate links: the store may pay CuponLab a commission and the price for the user does not change.";

type ToolResult = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

const DISCLOSURE = "Enlaces de afiliado de CuponLab: la tienda puede pagar una comisión, el precio no cambia.";

// One coupon as the tools return it
function shown(d: McpDeal, data: McpData, source: string, full = false) {
  return {
    id: d.id,
    store: d.store,
    title: d.title,
    type: d.kind === "code" ? "code" : "offer",
    code: d.kind === "code" ? d.code : "",
    discount: badgeLabel(d.discount) || d.discount,
    expires: d.expires_at || "",
    checked_by_a_person: !!d.verified,
    standing_offer: d.perk,
    used_last_7_days: d.uses_week,
    link: data.goUrl(d, source),
    page: data.pageUrl(d, source),
    ...(full ? { description: d.description, votes: d.score, comments: d.comments, category: categoryLabel(d.category) } : {}),
  };
}

const line = (c: ReturnType<typeof shown>) =>
  `- [${c.id}] ${c.store}: ${c.title}` +
  (c.discount ? ` (${c.discount})` : "") +
  (c.code ? ` · código ${c.code}` : " · oferta sin código") +
  (c.expires ? ` · caduca ${c.expires}` : "") +
  (c.checked_by_a_person ? " · comprobado" : "") +
  `\n  ${c.link}`;

function listResult(heading: string, items: ReturnType<typeof shown>[], extra: Record<string, unknown> = {}): ToolResult {
  const text = items.length ? `${heading}\n${items.map(line).join("\n")}\n\n${DISCLOSURE}` : heading;
  return { content: [{ type: "text", text }], structuredContent: { ...extra, coupons: items, disclosure: DISCLOSURE } };
}

// Run one tool; a bad argument or an unknown tool is a tool error the model can read and correct, not a protocol error
export async function callTool(name: string, rawArgs: unknown, data: McpData, source: string): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return fail(`Unknown tool: ${name}`);
  const parsed = tool.args.safeParse(rawArgs ?? {});
  if (!parsed.success) return fail(`Invalid arguments: ${z.prettifyError(parsed.error)}`);
  const args = parsed.data as Record<string, unknown>;
  const src = sourceParam(source) || "ia";
  const limit = (args.limit as number | undefined) ?? 8;
  const category = args.category as CategorySlug | undefined;
  const all = (await data.deals()).filter((d) => !category || d.category === category);

  if (name === "search_coupons") {
    let pool = all;
    const storeName = ((args.store as string | undefined) ?? "").trim();
    if (storeName) {
      const slugs = new Set(storeMatches(all, storeName));
      if (!slugs.size) {
        return listResult(`CuponLab no tiene ahora cupones de «${storeName}». list_stores dice qué tiendas cubre.`, [], { store_found: false });
      }
      pool = pool.filter((d) => slugs.has(d.store_slug));
    }
    if (args.only_codes) pool = pool.filter((d) => d.kind === "code" && d.code);
    const terms = searchTerms((args.query as string | undefined) ?? "");
    const ranked = sortDeals(pool, "destacados")
      .map((d) => ({ d, s: matchScore(d, terms) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => shown(x.d, data, src));
    const what = [args.query, storeName].filter(Boolean).join(" en ") || "tu búsqueda";
    return listResult(
      ranked.length ? `Cupones de CuponLab para «${what}» (hoy ${data.today()}):` : `CuponLab no tiene ahora cupones para «${what}».`,
      ranked,
      { query: args.query ?? "", store: storeName },
    );
  }

  if (name === "top_deals") {
    const top = sortDeals(all.filter((d) => !d.perk), "destacados").slice(0, limit).map((d) => shown(d, data, src));
    const label = category ? ` de ${categoryLabel(category)}` : "";
    return listResult(top.length ? `Mejores chollos${label} en CuponLab hoy (${data.today()}):` : `CuponLab no tiene ahora chollos${label}.`, top);
  }

  if (name === "get_coupon") {
    const d = all.find((x) => x.id === args.id);
    if (!d) return fail(`El cupón ${args.id as number} no existe o ya no está activo en CuponLab.`);
    const c = shown(d, data, src, true);
    const text = `${line(c)}\n${d.description ? `\n${d.description}\n` : ""}\nFicha: ${c.page}\n${DISCLOSURE}`;
    return { content: [{ type: "text", text }], structuredContent: { coupon: c, disclosure: DISCLOSURE } };
  }

  // list_stores
  const stores = new Map<string, { name: string; coupons: number; codes: number }>();
  for (const d of all) {
    const s = stores.get(d.store_slug) ?? { name: d.store, coupons: 0, codes: 0 };
    s.coupons++;
    if (d.kind === "code" && d.code) s.codes++;
    stores.set(d.store_slug, s);
  }
  const list = [...stores].sort((a, b) => b[1].coupons - a[1].coupons || a[1].name.localeCompare(b[1].name, "es"))
    .map(([slug, s]) => ({ store: s.name, coupons: s.coupons, codes: s.codes, page: data.storeUrl(slug, src) }));
  const text = list.length
    ? `Tiendas con cupones en CuponLab hoy (${list.length}):\n${list.map((s) => `- ${s.store}: ${s.coupons} (${s.codes} con código) ${s.page}`).join("\n")}`
    : "CuponLab no tiene ahora tiendas con cupones en esa categoría.";
  return { content: [{ type: "text", text }], structuredContent: { stores: list } };
}

// ---- JSON-RPC over Streamable HTTP

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "cuponlab", title: "CuponLab: cupones y chollos de España", version: "1.0.0", websiteUrl: "https://cuponlab.com" };

type RpcMessage = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
export type RpcReply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const rpcError = (id: RpcReply["id"], code: number, message: string): RpcReply => ({ jsonrpc: "2.0", id, error: { code, message } });

// One message in, one reply out (null for a notification, which gets 202 and no body)
export async function handleRpc(msg: unknown, data: McpData, source: string): Promise<RpcReply | null> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return rpcError(null, -32600, "Invalid Request");
  const { jsonrpc, id, method, params } = msg as RpcMessage;
  const validId = typeof id === "string" || typeof id === "number";
  if (jsonrpc !== "2.0" || typeof method !== "string") return rpcError(validId ? id : null, -32600, "Invalid Request");
  if (!validId) return null; // notifications: initialized, cancelled… nothing to do for a stateless server
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  const ok = (result: unknown): RpcReply => ({ jsonrpc: "2.0", id, result });

  switch (method) {
    case "initialize": {
      const asked = typeof p.protocolVersion === "string" ? p.protocolVersion : "";
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: toolList() });
    case "tools/call":
      if (typeof p.name !== "string") return rpcError(id, -32602, "Missing tool name");
      try {
        return ok(await callTool(p.name, p.arguments, data, source));
      } catch (e) {
        // the database didn't answer: a message the model can pass on, never a bare protocol error
        console.error("[mcp] tool failed", p.name, e);
        return ok(fail("CuponLab no ha podido cargar los cupones ahora mismo. Prueba de nuevo en un minuto."));
      }
    case "resources/list":
      return ok({ resources: [] });
    case "resources/templates/list":
      return ok({ resourceTemplates: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}
