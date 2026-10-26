// 03 Income Curve: the user's income is one of the points and follows input changes; taxable mode drops a column
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close, settle, setInput, text, ZURICH } from "./lib.mjs";

after(close);

test("the user's income row is highlighted and follows an income change made on the tab", { skip }, async () => {
  const page = await openApp({ query: `?tab=curve&${ZURICH}` });
  assert.equal(await page.locator("#curve-tbody tr").count(), 18);
  assert.equal(await text(page, "#curve-tbody tr.row-you th"), "CHF 100'000you");
  assert.equal(await page.locator("#curve-svg polyline").count(), 2);
  assert.equal(await text(page, "#curve-chart-title"), "Effective and marginal tax rate by income · 8001 Zürich");

  await settle(page, () => setInput(page, "#inc1-input", 145000));
  assert.equal(await text(page, "#curve-tbody tr.row-you th"), "CHF 145'000you");
  assert.equal(await page.locator("#curve-tbody tr.row-you").count(), 1);
  assert.equal(await page.locator("#curve-svg text", { hasText: "you · CHF 145'000" }).count(), 1);
  assert.deepEqual(page.errors, []);
});

test("taxable income: no taxable-income column and the taxable subtitle", { skip }, async () => {
  const page = await openApp({ query: `?tab=curve&${ZURICH}` });
  assert.equal(await page.locator("#curve-thead th").count(), 6);
  assert.match(await text(page, "#curve-chart-sub"), /^X-axis: gross household income/);

  await settle(page, () => page.click('input[name="mode"][value="taxable"] + span'));
  assert.equal(await page.locator("#curve-thead th").count(), 5);
  assert.match(await text(page, "#curve-chart-sub"), /^X-axis: taxable income/);
  assert.equal(await page.locator("#curve-tbody tr.row-you").count(), 1);
  assert.deepEqual(page.errors, []);
});
