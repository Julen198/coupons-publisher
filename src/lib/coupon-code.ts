// A code the network typed with spaces ("Black 15") while its own description spells it the way the shop accepts it
// ("con el cupón BLACK15"): use the description's spelling. Anything else stays as the network sent it.
export function codeFromText(code: string, text: string): string {
  const trimmed = code.trim();
  if (!/\s/.test(trimmed)) return trimmed;
  const compact = trimmed.replace(/\s+/g, "").toLowerCase();
  const word = text.split(/[^\p{L}\p{N}_-]+/u).find((w) => w.toLowerCase() === compact);
  return word ?? trimmed;
}
