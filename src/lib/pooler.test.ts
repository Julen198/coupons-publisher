import { test } from "node:test";
import assert from "node:assert/strict";
import { poolerUrl } from "./pooler.ts";

test("on Vercel the Supabase session pooler URL switches to the transaction pooler", () => {
  const u = "postgresql://user:p%24ss@aws-0-eu-north-1.pooler.supabase.com:5432/postgres";
  assert.equal(poolerUrl(u, true), "postgresql://user:p%24ss@aws-0-eu-north-1.pooler.supabase.com:6543/postgres");
  assert.equal(poolerUrl(u, false), u);
  assert.equal(poolerUrl("postgresql://u:p@localhost:5432/db", true), "postgresql://u:p@localhost:5432/db");
});
