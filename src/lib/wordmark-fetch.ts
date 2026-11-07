// Server/script only: finds a store's wordmark (its logo with the name, for landscape boxes) on its home page and
// downloads it as a data: URI with its real size. Downloads go through downloadLogo (fetchPublic: public addresses
// only, https only, ≤ 300 KB, type sniffed, SVG safety-checked); inline SVGs are checked the same way.
import { createHash } from "node:crypto";
import { imageSize } from "./image-size.ts";
import { isUnsafeSvg } from "./logo-choice.ts";
import { downloadLogo, MAX_LOGO_BYTES, type FetchedLogo, type LogoFetchOptions } from "./logo-fetch.ts";
import { fetchHead, publicAddresses } from "./og-image-fetch.ts";
import { chooseWordmark, htmlWordmarkCandidates, isWordmarkShape, type WordmarkCandidate, type WordmarkSource } from "./wordmark-choice.ts";

export type FetchedWordmark = Omit<FetchedLogo, "source"> & { source: WordmarkSource };
export interface WordmarkAttempt {
  url: string;
  source: WordmarkSource;
  result: string; // "WxH type" (plus "· not wide" when rejected for its shape) or why it was skipped
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function inlineWordmark(c: WordmarkCandidate & { inlineSvg: string }): FetchedWordmark {
  const body = Buffer.from(c.inlineSvg, "utf8");
  if (body.length > MAX_LOGO_BYTES) throw new Error("too big");
  if (isUnsafeSvg(c.inlineSvg)) throw new Error("unsafe svg");
  const size = imageSize(body, "image/svg+xml");
  if (!size) throw new Error("unreadable size");
  return {
    url: c.url,
    source: c.source,
    type: "image/svg+xml",
    width: size.width,
    height: size.height,
    sha256: createHash("sha256").update(body).digest("hex"),
    bytes: body.length,
    dataUri: `data:image/svg+xml;base64,${body.toString("base64")}`,
  };
}

// One wordmark image from a URL (also the script's --from), any shape: the caller decides whether it is wide enough
export async function downloadWordmark(url: string, source: WordmarkSource, o: LogoFetchOptions = {}): Promise<FetchedWordmark> {
  const logo = await downloadLogo(url, "schema", o);
  return { ...logo, source };
}

const describe = (w: FetchedWordmark) => `${Math.round(w.width)}x${Math.round(w.height)} ${w.type}${isWordmarkShape(w) ? "" : " · not wide"}`;

// The store's wordmark (see chooseWordmark) and every candidate tried, for the review page
export async function fetchWordmark(website: string, o: LogoFetchOptions = {}): Promise<{ wordmark: FetchedWordmark | null; tried: WordmarkAttempt[] }> {
  const tried: WordmarkAttempt[] = [];
  if (!URL.canParse(website)) return { wordmark: null, tried };
  const given = new URL(website);
  if (!/^https?:$/.test(given.protocol)) return { wordmark: null, tried };
  const page = o.allowHttp ? given : new URL(given.href.replace(/^http:/, "https:"));
  let candidates: WordmarkCandidate[] = [];
  try {
    const home = await fetchHead(page.href, o.resolve ?? publicAddresses, { httpsOnly: !o.allowHttp, stopWhen: undefined });
    candidates = htmlWordmarkCandidates(home.html, home.url, o.allowHttp);
  } catch (e) {
    tried.push({ url: page.href, source: "header", result: `home page: ${errorText(e)}` });
  }
  const downloaded: FetchedWordmark[] = [];
  for (const c of candidates) {
    try {
      const w = c.inlineSvg ? inlineWordmark({ ...c, inlineSvg: c.inlineSvg }) : await downloadWordmark(c.url, c.source, o);
      downloaded.push(w);
      tried.push({ url: c.url, source: c.source, result: describe(w) });
    } catch (e) {
      tried.push({ url: c.url, source: c.source, result: errorText(e) });
    }
  }
  return { wordmark: chooseWordmark(downloaded), tried };
}
