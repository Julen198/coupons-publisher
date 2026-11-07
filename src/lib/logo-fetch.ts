// Server/script only: finds a store's best logo on its website (web manifest, page icons, og:logo,
// schema.org logo) or Google's favicon cache, and downloads it as a data: URI with its real size.
// Every request goes through fetchPublic (public addresses only, pinned, redirects re-checked), https only.
import { createHash } from "node:crypto";
import { imageSize, sniffImageType } from "./image-size.ts";
import { chooseLogo, htmlLogoCandidates, isUnsafeSvg, LOGO_TYPES, manifestLogoCandidates, type LogoCandidate, type LogoSource } from "./logo-choice.ts";
import { fetchHead, fetchPublic, publicAddresses, type Resolve } from "./og-image-fetch.ts";

export const MAX_LOGO_BYTES = 300 * 1024;
const MAX_MANIFEST_BYTES = 100 * 1024;
const MAX_CANDIDATES = 12;
// A domain that can't exist: what Google answers for it is its "no icon" globe
const NO_SUCH_DOMAIN = "no-such-domain-cuponlab.invalid";

export interface LogoFetchOptions {
  resolve?: Resolve;
  allowHttp?: boolean; // tests only (local http server)
  googleFavicon?: (host: string) => string;
  placeholders?: ReadonlySet<string>; // sha256 of generic icons (see placeholderHashes)
}
export interface FetchedLogo extends LogoCandidate {
  dataUri: string;
  bytes: number;
}
export interface LogoAttempt {
  url: string;
  source: LogoSource;
  result: string; // "WxH type" or why it was skipped
}

const googleFavicon = (host: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=256`;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Downloads one image and checks it: allowed type (by its bytes, matching the header), ≤ 300 KB, safe SVG, readable size
export async function downloadLogo(url: string, source: LogoSource, o: LogoFetchOptions = {}): Promise<FetchedLogo> {
  const res = await fetchPublic(
    url,
    { accept: /^image\//, label: "an image", maxBytes: MAX_LOGO_BYTES, httpsOnly: !o.allowHttp, headers: { Accept: "image/png,image/webp,image/svg+xml,image/jpeg;q=0.9,*/*;q=0.1" } },
    o.resolve ?? publicAddresses,
  );
  if (!LOGO_TYPES.includes(res.type)) throw new Error(`not an allowed image (${res.type})`);
  const real = sniffImageType(res.body);
  if (real !== res.type) throw new Error(`not a ${res.type.split("/")[1]} (${real || "unknown bytes"})`);
  return logoFromBytes(res.body, res.url, source);
}

// The same checks for bytes that didn't come over HTTP (a logo file the editor downloaded by hand, --file)
export function logoFromBytes(body: Buffer, url: string, source: LogoSource): FetchedLogo {
  if (body.length > MAX_LOGO_BYTES) throw new Error(`too big (${Math.round(body.length / 1024)} KB, max ${MAX_LOGO_BYTES / 1024} KB)`);
  const real = sniffImageType(body);
  if (!real || !LOGO_TYPES.includes(real)) throw new Error(`not an allowed image (${real || "unknown bytes"})`);
  if (real === "image/svg+xml" && isUnsafeSvg(body.toString("utf8"))) throw new Error("unsafe svg");
  const size = imageSize(body, real);
  if (!size) throw new Error("unreadable size");
  return { url, source, type: real, width: size.width, height: size.height, sha256: sha256(body), bytes: body.length, dataUri: `data:${real};base64,${body.toString("base64")}` };
}

// Hashes of Google's generic "no favicon" globe (read once per run; empty if Google can't be reached)
export async function placeholderHashes(o: LogoFetchOptions = {}): Promise<Set<string>> {
  try {
    const res = await fetchPublic((o.googleFavicon ?? googleFavicon)(NO_SUCH_DOMAIN), { accept: /^image\//, label: "an image", maxBytes: MAX_LOGO_BYTES, httpsOnly: !o.allowHttp, anyStatus: true }, o.resolve ?? publicAddresses);
    return new Set([sha256(res.body)]);
  } catch {
    return new Set();
  }
}

// Candidates listed by the home page and its manifest (declared sizes), in source order; the home page is optional
async function listCandidates(page: URL, o: LogoFetchOptions, tried: LogoAttempt[]): Promise<LogoCandidate[]> {
  const resolve = o.resolve ?? publicAddresses;
  let listed: LogoCandidate[] = htmlLogoCandidates("", page.href, o.allowHttp).candidates;
  try {
    // the whole page (up to 512 KB), not just <head>: schema.org blocks often sit in the body
    const home = await fetchHead(page.href, resolve, { httpsOnly: !o.allowHttp, stopWhen: undefined });
    const { candidates, manifestUrl } = htmlLogoCandidates(home.html, home.url, o.allowHttp);
    listed = candidates;
    if (manifestUrl) {
      try {
        const m = await fetchPublic(manifestUrl, { accept: /json|manifest/i, label: "a manifest", maxBytes: MAX_MANIFEST_BYTES, httpsOnly: !o.allowHttp }, resolve);
        listed = [...manifestLogoCandidates(m.body.toString("utf8"), m.url, o.allowHttp), ...listed];
      } catch (e) {
        tried.push({ url: manifestUrl, source: "manifest", result: errorText(e) });
      }
    }
  } catch (e) {
    tried.push({ url: page.href, source: "icon", result: `home page: ${errorText(e)}` });
  }
  // Within a source, biggest declared first; drop ones declared tiny (unknown sizes stay)
  const order = ["manifest", "apple-touch-icon", "icon", "og:logo", "schema"];
  return listed
    .filter((c) => c.width === 0 || c.width >= 64 || c.type === "image/svg+xml")
    .sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source) || b.width - a.width)
    .slice(0, MAX_CANDIDATES);
}

// The store's best logo (see chooseLogo) and every URL tried, for the review page
export async function fetchLogo(website: string, o: LogoFetchOptions = {}): Promise<{ logo: FetchedLogo | null; tried: LogoAttempt[] }> {
  const tried: LogoAttempt[] = [];
  if (!URL.canParse(website)) return { logo: null, tried };
  const given = new URL(website);
  if (!/^https?:$/.test(given.protocol)) return { logo: null, tried };
  const page = o.allowHttp ? given : new URL(given.href.replace(/^http:/, "https:"));
  const listed = [...(await listCandidates(page, o, tried)), { url: (o.googleFavicon ?? googleFavicon)(page.hostname), width: 0, height: 0, type: "", source: "google" as const }];
  const downloaded: FetchedLogo[] = [];
  for (const c of listed) {
    try {
      const logo = await downloadLogo(c.url, c.source, o);
      downloaded.push(logo);
      tried.push({ url: c.url, source: c.source, result: `${logo.width}x${logo.height} ${logo.type}` });
    } catch (e) {
      tried.push({ url: c.url, source: c.source, result: errorText(e) });
    }
  }
  return { logo: chooseLogo(downloaded, o.placeholders), tried };
}
