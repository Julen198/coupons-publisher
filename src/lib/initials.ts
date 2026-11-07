// What a store tile shows when it has no usable logo:
// "43einhalb" → "43", "El Corte Inglés" → "ECI", "PcComponentes" → "PC", "zalando" → "Z",
// and a one-word name written in capitals ("IKEA", "ASMAX") is a brand: its first letter, not "IKE" (up to 2 letters kept: "HP")
export function initialsOf(name: string): string {
  const digits = /^\d{1,2}/.exec(name)?.[0];
  if (digits) return digits;
  const word = name.trim();
  if (/^\p{Lu}{3,}$/u.test(word)) return word.charAt(0);
  const caps = (name.match(/\p{Lu}/gu) ?? []).slice(0, 3).join("");
  return caps || name.charAt(0).toUpperCase();
}
