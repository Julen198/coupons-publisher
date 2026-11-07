// Cheap, fast model through Vercel AI Gateway (auth via OIDC on Vercel / `vercel env pull` locally).
// Its own module so scripts (plain node, no Next) can use it too.
export const MODEL = "anthropic/claude-haiku-5.5";
