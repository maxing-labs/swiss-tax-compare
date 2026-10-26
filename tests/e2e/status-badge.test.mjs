// The status badge counts every request in and out, superseded ones included
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close, settle, badge, setInput, text, delay, ZURICH } from "./lib.mjs";

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
