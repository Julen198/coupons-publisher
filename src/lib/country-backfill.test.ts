import { test } from "node:test";
import assert from "node:assert/strict";
import { planCountryBackfill } from "./country-backfill.ts";

const row = (id: number, slug: string, name: string, website: string, country = "", country_source = "") =>
  ({ id, slug, name, website, tracking_url: "", country, country_source });

test("only stores with no country get one, inferred; manual and network ones stay; no signal stays empty", () => {
  const plan = planCountryBackfill([
    row(1, "myprotein-de", "Myprotein DE", "https://de.myprotein.com"),
    row(2, "decathlon", "Decathlon", "https://www.decathlon.es"),
    row(3, "pccomponentes", "PcComponentes", "https://www.pccomponentes.com"),
    row(4, "jd-sports", "JD Sports", "https://www.jdsports.it", "ES", "manual"),
    row(5, "x-de", "X DE", "https://x.de", "", "manual"),
    row(6, "y", "Y", "https://y.fr", "FR", "network"),
  ]);
  assert.deepEqual(plan.updates, [
    { id: 1, slug: "myprotein-de", country: "DE", reason: "nombre «Myprotein DE»" },
    { id: 2, slug: "decathlon", country: "ES", reason: "dominio .es" },
  ]);
  assert.deepEqual(plan.noSignal, ["pccomponentes"]);
  assert.deepEqual(plan.kept, ["jd-sports (ES, manual)", "x-de (sin definir, manual)", "y (FR, network)"]);
});
