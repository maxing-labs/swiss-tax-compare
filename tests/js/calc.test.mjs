import { test } from "node:test";
import assert from "node:assert/strict";
import { breakdown, effectiveRate, incomeBase, rankPlaces, filterPlaces, rankOf, median, curveSeries, historySeries, niceStep, rankSavings, selfEmployed3a } from "../../static/js/calc.js";

const result = { incomeTax: { fed: 1000, canton: 2000, city: 2500, church: 500 }, wealthTax: { canton: 100, city: 120, church: 0 }, personal: 24 };

test("breakdown: levels add up to the total and shares to 100", () => {
  const { rows, total, wealthTotal } = breakdown(result);
  assert.equal(total, 6244);
  assert.equal(wealthTotal, 220);
  assert.equal(rows.find(r => r.level === "canton").total, 2100);
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.share, 0) - 100) < 1e-9);
});

test("effective rate and income base follow the input mode", () => {
  assert.equal(incomeBase({ mode: "gross", inc1: 100000, inc2: 20000 }), 120000);
  assert.equal(incomeBase({ mode: "taxable", taxable: 80000, inc1: 100000 }), 80000);
  assert.equal(effectiveRate(12000, 120000), 10);
  assert.equal(effectiveRate(12000, 0), null);
});

const rows = [
  { loc: { bfsId: 1, city: "Baar", canton: "ZG", cantonId: 25 }, total: 5000, isCapital: false },
  { loc: { bfsId: 2, city: "Zug", canton: "ZG", cantonId: 25 }, total: 5200, isCapital: true },
  { loc: { bfsId: 3, city: "Zürich", canton: "ZH", cantonId: 26 }, total: 12000, isCapital: true },
  { loc: { bfsId: 4, city: "Adliswil", canton: "ZH", cantonId: 26 }, total: 12000, isCapital: false }
];

test("rankPlaces: sorted ascending with the difference to the own place", () => {
  const { list, own } = rankPlaces(rows, 3);
  assert.equal(own.loc.city, "Zürich");
  assert.deepEqual(list.map(r => r.loc.city), ["Baar", "Zug", "Adliswil", "Zürich"]);
  assert.equal(list[0].diff, -7000);
  assert.equal(list.find(r => r.isYou).diff, 0);
  assert.equal(rankPlaces(rows, 99).list[0].diff, null);
});

test("filterPlaces: scope and text filter", () => {
  assert.deepEqual(filterPlaces(rows, { scope: "capitals" }).map(r => r.loc.city), ["Zug", "Zürich"]);
  assert.deepEqual(filterPlaces(rows, { scope: "canton", cantonId: 26 }).map(r => r.loc.city), ["Zürich", "Adliswil"]);
  assert.deepEqual(filterPlaces(rows, { scope: "all", query: "zg" }).map(r => r.loc.city), ["Baar", "Zug"]);
  assert.deepEqual(filterPlaces(rows, { scope: "all", query: "adli" }).map(r => r.loc.city), ["Adliswil"]);
});

test("rankOf: ties share the better rank; median", () => {
  const asc = rankPlaces(rows, 3).list;
  assert.equal(rankOf(asc, 3), 3);
  assert.equal(rankOf(asc, 4), 3);
  assert.equal(rankOf(asc, 99), null);
  assert.equal(median([5000, 5200, 12000, 12000]), 8600);
  assert.equal(median([]), null);
});

test("curveSeries fills a missing marginal rate from the slope", () => {
  const pts = curveSeries([{ income: 50000, total: 2000, marginalRate: null }, { income: 60000, total: 3500, marginalRate: 20 }]);
  assert.equal(pts[0].effective, 4);
  assert.equal(pts[0].marginalRate, 15);
  assert.equal(pts[1].marginalRate, 20);
});

test("historySeries: year-over-year change skips missing years", () => {
  const s = historySeries([{ year: 2010, total: 1000 }, { year: 2011, total: null }, { year: 2012, total: 1100 }]);
  assert.equal(s[0].change, null);
  assert.equal(s[1].change, null);
  assert.equal(s[2].change, 100);
  assert.equal(s[2].changePct, 10);
});

test("niceStep: a 1-2-5 step giving at most maxTicks intervals", () => {
  assert.equal(niceStep(500000, 6), 100000);
  assert.equal(niceStep(2329, 4), 1000);
  assert.equal(niceStep(42, 5), 10);
  assert.equal(niceStep(30, 3), 10);
});

test("rankSavings: most saved first, ties by name, the user's place marked", () => {
  const row = (city, bfsId, saved) => ({ loc: { city, bfsId }, tiers: [{ saved: 0 }, { saved: saved / 2 }, { saved }] });
  const ranked = rankSavings([row("Zug", 1, 900), row("Bern", 2, 1500), row("Aarau", 3, 900)], 2);
  assert.deepEqual(ranked.map(r => r.loc.city), ["Bern", "Aarau", "Zug"]);
  assert.deepEqual(ranked.map(r => r.isYou), [true, false, false]);
});

test("selfEmployed3a: 20% of the income, capped at the limit", () => {
  const caps = { withPension: 7258, selfEmployed: 36288 };
  assert.equal(selfEmployed3a(caps, 100000), 20000);
  assert.equal(selfEmployed3a(caps, 500000), 36288);
});
