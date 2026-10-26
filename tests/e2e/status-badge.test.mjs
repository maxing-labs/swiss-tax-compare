// The status badge counts every request in and out, superseded ones included
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close, settle, badge, setInput, takeToasts, text, delay, ZURICH } from "./lib.mjs";

after(close);

test("two quick income changes: the badge comes back to 'Data loaded' and shows the second one's tax", { skip }, async () => {
  const page = await openApp({ query: `?tab=overview&${ZURICH}` });
  // the first change answers late, after the second
  await page.route("**/api/calculate?*inc1=110000*", async (r) => { await delay(1500); r.continue().catch(() => {}); });
  await settle(page, async () => {
    await setInput(page, "#inc1-input", 110000);
    await setInput(page, "#inc1-input", 120000);
  });
  await delay(1800);
  assert.deepEqual(await badge(page), { text: "Data loaded", loading: false, error: false });

  const expected = await page.evaluate(async () => {
    const { fmtChf } = await import("/js/format.js");
    const { householdParams } = await import("/js/api.js");
    const { state } = await import("/js/state.js");
    const json = await (await fetch(`/api/calculate?${householdParams(state)}`)).json();
    return `CHF ${fmtChf(json.result.total)}`;
  });
  assert.match(await page.evaluate(() => location.search), /inc1=120000/);
  assert.equal(await text(page, "#kpi-total"), expected);
  assert.deepEqual(page.errors, []);
});

test("the API answers 502: the badge shows the error and a toast says so", { skip }, async () => {
  const page = await openApp({ query: `?tab=overview&${ZURICH}` });
  await takeToasts(page);
  await page.route("**/api/calculate?*", (r) => r.fulfill({ status: 502, contentType: "application/json", body: '{"error": "Bad Gateway"}' }));
  await settle(page, () => setInput(page, "#inc1-input", 110000));
  assert.deepEqual(await badge(page), { text: "Load failed", loading: false, error: true });
  assert.deepEqual(await takeToasts(page), ["Failed to load data, please try again later"]);
  // the failed request itself is logged, nothing else
  assert.ok(page.errors.length > 0 && page.errors.every(e => e.includes("502")), page.errors.join(" | "));
});
