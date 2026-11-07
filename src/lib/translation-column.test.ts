import { test } from "node:test";
import assert from "node:assert/strict";
import { isMissingTranslation, translationSql, withTranslationColumns } from "./translation-column.ts";

const missing = Object.assign(new Error("column c.title_es does not exist"), { code: "42703" });
const otherMissing = Object.assign(new Error("column s.country does not exist"), { code: "42703" });

test("withTranslationColumns falls back while the columns are missing, and checks again after a few minutes", async () => {
  let t = 0;
  const now = () => t;
  const calls: boolean[] = [];
  const run = async (present: boolean) => {
    calls.push(present);
    if (present) throw missing;
    return "ok";
  };
  assert.equal(await withTranslationColumns(run, now), "ok");
  assert.deepEqual(calls, [true, false]);
  t = 60_000;
  await withTranslationColumns(run, now);
  assert.deepEqual(calls, [true, false, false], "no retry within 5 minutes");
  t = 6 * 60_000;
  await withTranslationColumns(run, now);
  assert.deepEqual(calls, [true, false, false, true, false]);
});

test("only an error naming the translation columns counts", async () => {
  assert.equal(isMissingTranslation(missing), true);
  assert.equal(isMissingTranslation(Object.assign(new Error('column "translation_status" does not exist'), { code: "42703" })), true);
  assert.equal(isMissingTranslation(otherMissing), false);
  await assert.rejects(withTranslationColumns(async () => { throw otherMissing; }, () => 1e13), /country/);
});

test("translationSql: the columns, or empty strings while they are missing", () => {
  assert.equal(translationSql(true, "c"), "c.title_es, c.description_es, c.translation_status, c.translated_from");
  assert.equal(translationSql(false, "c"), "'' AS title_es, '' AS description_es, '' AS translation_status, '' AS translated_from");
});
