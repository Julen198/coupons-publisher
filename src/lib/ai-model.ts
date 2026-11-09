// Cheap, fast model through Vercel AI Gateway (auth via OIDC on Vercel / `vercel env pull` locally).
// Its own module so scripts (plain node, no Next) can use it too.
export const MODEL = "anthropic/claude-haiku-5.5";
// Long-form SEO guides (guides-cron.ts): a few a day, where writing quality matters more than cost
export const GUIDE_MODEL = "anthropic/claude-sonnet-5.5";
