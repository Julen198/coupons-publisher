// Just enough XML for flat API responses (CJ, Rakuten): repeated records of simple child elements.
// No attributes, no nesting beyond one level — anything richer should get a real parser.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export const decodeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
    )
    .trim();

const esc = (tag: string) => tag.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

// Inner XML of every <tag …>…</tag> (self-closing <tag/> → "")
export function elements(xml: string, tag: string): string[] {
  const re = new RegExp(`<${esc(tag)}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${esc(tag)}>)`, "g");
  return [...xml.matchAll(re)].map((m) => m[1] ?? "");
}

// Decoded text of the first <tag> inside a record, "" when missing
export const text = (xml: string, tag: string) => {
  const inner = elements(xml, tag)[0];
  return inner === undefined ? "" : decodeXml(inner.replace(/<(?!!\[CDATA\[)[^>]+>/g, " ").replace(/\s+/g, " "));
};

// Value of an attribute on the first <tag …> (e.g. <links total-matched="120">)
export const attr = (xml: string, tag: string, name: string) =>
  decodeXml(xml.match(new RegExp(`<${esc(tag)}\\s[^>]*\\b${esc(name)}="([^"]*)"`))?.[1] ?? "");
