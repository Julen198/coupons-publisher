// Pure pieces of the reader sign-in flow (/entrar): the resend countdown, the handle preview and the one-time
// "you're in" flash. No server or browser imports, so the client bundle and the tests can both use them.

// Matches the server's per-email cooldown (MAGIC_LINK_COOLDOWN_SECONDS), which still has the last word
export const RESEND_SECONDS = 65; // the server refuses a second link to the same email within 60 s

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const resendLabel = (left: number) => (left > 0 ? `Reenviar en ${formatCountdown(left)}` : "Reenviar");

// What the server will store (cleanHandle lower-cases and trims), so the preview never promises something else
export const handlePreview = (raw: string) => raw.trim().toLowerCase();
export const handleInitial = (handle: string) => handle.charAt(0).toUpperCase() || "?";

// The flash rides in a short-lived httpOnly cookie, read once by the layout and then cleared
export const FLASH_COOKIE = "cl_flash";
export const FLASH_MAX_AGE = 60;

export type Flash = { kind: "in" | "new"; handle: string };

const FLASH = /^(in|new):([a-z0-9_]{3,20})$/;

export const encodeFlash = (f: Flash) => `${f.kind}:${f.handle}`;

export function decodeFlash(raw: string | undefined): Flash | null {
  const m = raw ? FLASH.exec(raw) : null;
  return m ? { kind: m[1] as Flash["kind"], handle: m[2] } : null;
}

export const flashMessage = (f: Flash) =>
  f.kind === "new" ? `Bienvenido a CuponLab, @${f.handle}` : `Ya has entrado como @${f.handle}`;
