// Supabase session pooler (5432) → transaction pooler (6543) on Vercel; see sql() in db.ts for why
export function poolerUrl(url: string, onVercel: boolean): string {
  return onVercel && /\.pooler\.supabase\.com:5432\//.test(url) ? url.replace(/(\.pooler\.supabase\.com):5432\//, "$1:6543/") : url;
}
