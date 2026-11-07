import { test } from "node:test";
import assert from "node:assert/strict";
import { filterStores, paginate } from "./store-filter.ts";

const s = (id: number, name: string, website: string, network = "awin", merchant_id = "", tracking_url = "") =>
  ({ id, name, website, network, merchant_id, tracking_url });
const stores = [
  s(1, "MediaMarkt", "https://www.mediamarkt.es", "awin", "123"),
  s(2, "Temu", "https://www.temu.com/es"),
  s(3, "Booking", "https://www.booking.com", "tradedoubler", "", "https://clk.td.com/?url={url}"),
  s(4, "Barceló", "https://www.barcelo.com", "tradedoubler"),
];
const live = new Map([[1, 4], [3, 1]]); // visible coupons per store id

test("filters by text (accent-insensitive, name or web), network, tracking and coupons", () => {
  const ids = (f: Parameters<typeof filterStores>[1]) => filterStores(stores, f, live).map((x) => x.id);
  assert.deepEqual(ids({}), [1, 2, 3, 4]);
  assert.deepEqual(ids({ q: "barcelo" }), [4]);
  assert.deepEqual(ids({ q: "temu.com" }), [2]);
  assert.deepEqual(ids({ network: "tradedoubler" }), [3, 4]);
  assert.deepEqual(ids({ tracking: "missing" }), [2, 4]);
  assert.deepEqual(ids({ tracking: "ok" }), [1, 3]);
  assert.deepEqual(ids({ coupons: "none" }), [2, 4]);
  assert.deepEqual(ids({ coupons: "some", network: "awin" }), [1]);
});

test("paginate clamps the page and reports the range", () => {
  const items = Array.from({ length: 53 }, (_, i) => i);
  assert.deepEqual(paginate(items, 3, 25), { rows: [50, 51, 52], page: 3, pages: 3, from: 51, to: 53 });
  assert.equal(paginate(items, 99, 25).page, 3);
  assert.equal(paginate(items, -1, 25).page, 1);
  assert.deepEqual(paginate([], 1, 25), { rows: [], page: 1, pages: 1, from: 0, to: 0 });
});

test("filters by country: the stored one, else the one read from the store; none = no country at all", () => {
  const c = [
    { ...s(5, "Myprotein DE", "https://de.myprotein.com"), slug: "myprotein-de", country: "" },
    { ...s(6, "PcComponentes", "https://www.pccomponentes.com"), slug: "pccomponentes", country: "" },
    { ...s(7, "JD Sports", "https://www.jdsports.it"), slug: "jd-sports", country: "ES" },
    { ...s(8, "Decathlon", "https://www.decathlon.es"), slug: "decathlon", country: "" },
  ];
  const ids = (country: string) => filterStores(c, { country }, live).map((x) => x.id);
  assert.deepEqual(ids("DE"), [5]);
  assert.deepEqual(ids("ES"), [7, 8]);
  assert.deepEqual(ids("none"), [6]);
  assert.deepEqual(ids(""), [5, 6, 7, 8]);
});
