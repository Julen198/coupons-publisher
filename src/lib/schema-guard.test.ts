import assert from "node:assert/strict";
import { test } from "node:test";
import { isMissingSchema } from "./schema-guard.ts";

test("isMissingSchema spots a column or table that the migration hasn't created yet", () => {
  assert.equal(isMissingSchema({ code: "42703" }), true);
  assert.equal(isMissingSchema({ code: "42P01" }), true);
  assert.equal(isMissingSchema({ code: "23505" }), false);
  assert.equal(isMissingSchema(new Error("boom")), false);
  assert.equal(isMissingSchema(null), false);
  assert.equal(isMissingSchema("42703"), false);
});
