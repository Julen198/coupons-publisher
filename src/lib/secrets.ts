import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Network API credentials are stored encrypted (AES-256-GCM) so a database dump alone doesn't leak them.
// ponytail: key derived from SESSION_SECRET; rotating that secret means re-entering the network credentials
function key(secret = process.env.SESSION_SECRET): Buffer {
  if (!secret) throw new Error("SESSION_SECRET no está configurada");
  return createHash("sha256").update(`network-credentials:${secret}`).digest();
}

// "v1.<iv>.<tag>.<ciphertext>", all base64url
export function encryptJson(value: unknown, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptJson<T>(blob: string, secret?: string): T {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Credenciales guardadas con un formato desconocido");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  try {
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")) as T;
  } catch {
    throw new Error("No se pueden leer las credenciales (¿ha cambiado SESSION_SECRET?): vuelve a introducirlas");
  }
}
