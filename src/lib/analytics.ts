// Pure helpers for the public site's analytics (no DOM), so they can be unit-tested.

// The Google Analytics 4 measurement id (GA_MEASUREMENT_ID, "G-XXXXXXX"); "" when unset or malformed, so no tag loads
export function gaMeasurementId(raw = process.env.GA_MEASUREMENT_ID): string {
  const id = (raw ?? "").trim().toUpperCase();
  return /^G-[A-Z0-9]{4,}$/.test(id) ? id : "";
}

// The Search Console "HTML tag" token (GOOGLE_SITE_VERIFICATION); accepts the bare token or the whole <meta> tag pasted in
export function googleSiteVerification(raw = process.env.GOOGLE_SITE_VERIFICATION): string {
  const s = (raw ?? "").trim();
  const token = s.match(/content=["']([^"']+)["']/)?.[1] ?? s;
  return /^[A-Za-z0-9_-]{10,}$/.test(token) ? token : "";
}

// The reader's cookie choice, kept in localStorage under CONSENT_KEY
export type Consent = "granted" | "denied";
export const CONSENT_KEY = "cookie-consent";
export const consentOf = (v: string | null | undefined): Consent | null => (v === "granted" || v === "denied" ? v : null);

// Runs inline before gtag.js: Consent Mode v2 starts denied (no cookies) unless the reader already accepted
export function consentDefaultsScript(id: string): string {
  return [
    "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}",
    `var c=null;try{c=localStorage.getItem('${CONSENT_KEY}')}catch(e){}`,
    "gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:c==='granted'?'granted':'denied'});",
    "gtag('js',new Date());",
    `gtag('config','${id}');`,
  ].join("");
}
