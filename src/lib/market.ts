// The public site is Spanish: stores whose website lives in another European market (jdsports.it, bergfreunde.de…)
// stay out of it. Only the host's ending counts; "" (no website) stays in.
const OTHER_MARKETS = [".it", ".pt", ".fr", ".de", ".nl", ".be", ".at", ".ch", ".co.uk", ".uk", ".pl", ".se", ".dk", ".fi", ".ie"];

export function hostOf(website: string): string {
  return website
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

export function isSpanishMarket(website: string): boolean {
  const host = hostOf(website);
  return !OTHER_MARKETS.some((tld) => host.endsWith(tld));
}
