// Selected places use individual /calculate calls. Delayed/error responses are deterministic;
// compare.test.mjs continues to cover the real municipality ranking and its responsive chart.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close, settle, clickTab, setInput, recordRequests, text, delay, ZURICH } from "./lib.mjs";

after(close);
const ZUG = { id: 630000000, name: "6300 Zug", bfsId: 1711, canton: "ZG" };
const PLACES = [ZUG,
  { id: 100000000, name: "1000 Lausanne", bfsId: 5586, canton: "VD" },
  { id: 300000000, name: "3000 Bern", bfsId: 351, canton: "BE" },
  { id: 400100000, name: "4001 Basel", bfsId: 2701, canton: "BS" },
  { id: 120000000, name: "1200 Genève", bfsId: 6621, canton: "GE" }
];
const query = (places = [], extra = "") => `?tab=compare&${ZURICH}&places=${encodeURIComponent(JSON.stringify(places))}${extra}`;
const add = (page, p = ZUG) => page.evaluate(async p => (await import("/js/controller.js")).addComparePlace(p), p);
const remove = (page, p = ZUG) => page.evaluate(async p => (await import("/js/controller.js")).removeComparePlace(p.bfsId), p);
const rows = page => page.locator("#compare-tbody tr");
const chips = page => page.locator(".compare-place-chip");

function calculation(url) {
  const p = new URL(url).searchParams;
  const mode = p.get("mode"), status = Number(p.get("status"));
  const couple = status === 2 || status === 4;
  const base = mode === "gross" ? Number(p.get("inc1")) + (couple ? Number(p.get("inc2")) : 0) : Number(p.get("taxable"));
  const total = (Number(p.get("loc")) === 800100000 ? 12000 : 7000) * base / 100000;
  return { household: { mode, status, year: Number(p.get("year")), inc1: Number(p.get("inc1")), inc2: couple ? Number(p.get("inc2")) : 0, taxable: Number(p.get("taxable")), wealth: Number(p.get("wealth")) },
    result: { total, incomeTax: { fed: total / 4, canton: total / 2, city: total / 4, church: 0 }, wealthTax: {},
      taxableIncomeFed: base * 0.8, taxableIncomeCanton: base * 0.8, p1: { gross: base, net: base * 0.88 }, p2: {}, marginalRate: 20 } };
}
async function mock(page, handler = null) {
  await page.route("**/api/calculate?*", async route => {
    if (handler && await handler(route)) return;
    await route.fulfill({ json: calculation(route.request().url()) }).catch(() => {});
  });
  await page.route("**/api/locations?*", route => route.fulfill({ json: { locations: [
    { ...ZUG, zip: "6300", city: "Zug" }, { ...ZUG, id: 630100000, zip: "6301", city: "Zug" }
  ] } }));
}

test("default: current place, keyboard search, municipal deduplication, and no full ranking request", { skip }, async () => {
  let calls, ranking;
  const page = await openApp({ query: `?tab=compare&${ZURICH}`, beforeGoto: async p => {
    calls = recordRequests(p, "calculate"); ranking = recordRequests(p, "compare"); await mock(p);
  } });
  assert.equal(await chips(page).count(), 1);
  assert.match(await text(page, "#compare-selection-note"), /Add another place/);
  assert.equal(await page.locator('input[name="scope"][value="selected"]').isChecked(), true);
  assert.equal(calls.length, 1, "current place shares the overview request");
  const input = page.locator("#compare-location-search");
  await input.fill("Zug");
  await page.waitForSelector("#compare-location-dropdown li[data-id]");
  await input.press("ArrowDown");
  await settle(page, () => input.press("Enter"));
  assert.equal(await chips(page).count(), 2);
  assert.equal(await rows(page).count(), 2);
  assert.equal(await page.locator("#compare-svg rect").count(), 2);
  assert.match(await text(page, '#compare-tbody tr[data-place-bfs="1711"]'), /lowest tax.*7'000.*7.0%.*81'000.*−5'000/);
  assert.match(await text(page, "#compare-tbody tr.row-you"), /Zürich.*you.*12'000.*76'000/);
  await input.fill("6301");
  await page.waitForSelector("#compare-location-dropdown li[data-id]");
  await page.locator("#compare-location-dropdown li[data-id]").nth(1).click();
  assert.equal(await chips(page).count(), 2);
  assert.equal(calls.length, 2);
  assert.deepEqual(ranking, []);
  assert.deepEqual(page.errors, []);
});

test("changing the current place replaces its pinned chip and recomputes the baseline", { skip }, async () => {
  const page = await openApp({ query: query([ZUG]), beforeGoto: p => mock(p) });
  await page.locator("#location-search").fill("Zug");
  await page.waitForSelector("#location-dropdown li[data-id]");
  await settle(page, () => page.locator("#location-dropdown li[data-id]").first().click());
  assert.equal(await chips(page).count(), 1);
  assert.match(await text(page, "#compare-tbody tr.row-you"), /Zug.*7'000.*±0/);
  assert.match(await text(page, "#compare-selection-note"), /Add another place/);
  assert.deepEqual(page.errors, []);
});

test("six-place limit includes the pinned current place, and removing a chip permits another place", { skip }, async () => {
  const page = await openApp({ query: query(PLACES), beforeGoto: p => mock(p), phone: true });
  assert.equal(await chips(page).count(), 6);
  assert.equal(await page.locator("[data-remove-place]").count(), 5);
  assert.equal(await page.locator("#compare-location-search").isDisabled(), true);
  assert.equal(await page.locator(".selected-compare-table").evaluate(el => el.scrollHeight > el.clientHeight), false);
  await add(page, { id: 690000000, name: "6900 Lugano", bfsId: 5192, canton: "TI" });
  assert.equal(await chips(page).count(), 6);
  await settle(page, () => page.locator(`[data-remove-place="${ZUG.bfsId}"]`).click());
  assert.equal(await chips(page).count(), 5);
  assert.equal(await page.locator("#compare-location-search").isEnabled(), true);
  const bounds = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth,
    touches: [...document.querySelectorAll("[data-remove-place]")].map(el => el.getBoundingClientRect().height) }));
  assert.equal(bounds.page, bounds.viewport);
  assert.ok(bounds.touches.every(h => h >= 44));
  assert.deepEqual(page.errors, []);
});

test("selection survives storage reload and is restored in a new visitor's shared URL", { skip }, async () => {
  const page = await openApp({ query: query([ZUG]), beforeGoto: p => mock(p) });
  const shared = new URL(page.url()).search;
  await page.evaluate(() => history.replaceState(null, "", "/"));
  await settle(page, () => page.reload());
  assert.equal(await chips(page).count(), 2);
  const visitor = await openApp({ query: shared, beforeGoto: p => mock(p) });
  assert.match(await text(visitor, "#compare-place-chips"), /Zürich.*Zug/);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(visitor.errors, []);
});

test("all selected places get identical household inputs; gross/taxable and other input changes refetch", { skip }, async () => {
  const page = await openApp({ query: query([ZUG]), beforeGoto: p => mock(p) });
  const calls = recordRequests(page, "calculate");
  await settle(page, () => setInput(page, "#inc1-input", 150000));
  assert.equal(calls.length, 2);
  assert.match(await text(page, '#compare-tbody tr[data-place-bfs="1711"]'), /10'500/);
  await settle(page, () => page.locator('label:has(input[name="mode"][value="taxable"])').click());
  assert.match(await text(page, "#compare-income-note"), /not take-home pay/);
  await settle(page, () => setInput(page, "#taxable-input", 80000));
  assert.match(await text(page, '#compare-tbody tr[data-place-bfs="1711"]'), /5'600.*74'400/);
  for (const [sel, value] of [["#wealth-input", 300000], ["#year-select", 2025], ["#status-select", 2], ["#inc2-input", 60000], ["#kids-input", "4, 9"], ["#conf1-select", 1]]) {
    const before = calls.length;
    await settle(page, () => setInput(page, sel, value));
    const latest = calls.slice(before).map(url => {
      const p = new URL(url).searchParams; p.delete("loc"); return p.toString();
    });
    assert.equal(latest.length, 2);
    assert.equal(latest[0], latest[1]);
  }
  assert.deepEqual(page.errors, []);
});

test("one place can fail without hiding others; retry requests only failed places", { skip }, async () => {
  let fail = true;
  const page = await openApp({ query: query([ZUG]), beforeGoto: p => mock(p, async route => {
    if (fail && new URL(route.request().url()).searchParams.get("loc") === String(ZUG.id)) {
      await route.fulfill({ status: 502, json: { error: "Bad Gateway" } }); return true;
    }
  }) });
  assert.equal(await page.locator('#compare-tbody tr[data-place-status="error"]').count(), 1);
  assert.match(await text(page, "#compare-tbody tr.row-you"), /12'000/);
  assert.match(await text(page, "#compare-request-status"), /could not be calculated/);
  assert.match(await text(page, "#compare-tbody .lowest-badge"), /lowest available/);
  const calls = recordRequests(page, "calculate");
  fail = false;
  await settle(page, () => page.click("#btn-compare-retry"));
  assert.equal(calls.length, 1);
  assert.equal(await page.locator('#compare-tbody tr[data-place-status="ready"]').count(), 2);
  assert.equal(await page.locator("#btn-compare-retry").isVisible(), false);
  assert.deepEqual(page.errors.filter(e => !e.includes("502")), []);
});

test("rapid add/remove and input changes ignore late results, including while the tab is hidden", { skip }, async () => {
  const page = await openApp({ query: query(), beforeGoto: p => mock(p, async route => {
    const p = new URL(route.request().url()).searchParams;
    if (p.get("loc") === String(ZUG.id)) {
      await delay(500);
      await route.fulfill({ json: calculation(route.request().url()) }).catch(() => {});
      return true;
    }
  }) });
  const request = page.waitForRequest(r => r.url().includes(`loc=${ZUG.id}`));
  await add(page);
  await request;
  await settle(page, () => remove(page));
  await delay(600);
  assert.equal(await rows(page).count(), 1);
  await add(page);
  await settle(page, () => setInput(page, "#inc1-input", 150000));
  await delay(600);
  assert.match(await text(page, '#compare-tbody tr[data-place-bfs="1711"]'), /10'500/);
  // A hidden tab invalidates without starting another comparison request.
  await clickTab(page, "overview");
  await settle(page, () => setInput(page, "#inc1-input", 200000));
  await delay(600);
  assert.equal(await page.evaluate(async () => (await import("/js/state.js")).state.selectedCompare), null);
  await settle(page, () => clickTab(page, "compare"));
  assert.match(await text(page, '#compare-tbody tr[data-place-bfs="1711"]'), /14'000/);
  assert.deepEqual(page.errors, []);
});

for (const lang of ["de", "zh"]) {
  test(`${lang}: phone search, chips and comparison labels are translated`, { skip }, async () => {
    const page = await openApp({ query: query([], `&lang=${lang}`), phone: true, beforeGoto: p => mock(p) });
    await page.locator("#compare-location-search").fill("Zug");
    await page.waitForSelector("#compare-location-dropdown li[data-id]");
    await settle(page, () => page.locator("#compare-location-dropdown li[data-id]").first().tap());
    const dict = await page.evaluate(async lang => (await import("/js/i18n/index.js")).I18N[lang], lang);
    assert.match(await text(page, "#compare-thead"), new RegExp(dict.compareAfterTax));
    assert.equal(await page.getAttribute("[data-remove-place]", "aria-label"), lang === "zh" ? "从比较中移除 6300 Zug" : "6300 Zug aus dem Vergleich entfernen");
    assert.equal(await page.locator("#compare-svg rect").count(), 2);
    assert.deepEqual(page.errors, []);
  });
}
