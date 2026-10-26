// 05 Tax Savings: the user's place first, then the 26 capitals; amount changes reload only this view
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close, settle, setInput, clickTab, recordRequests, text, texts, delay, ZURICH } from "./lib.mjs";

after(close);

const rankRows = (page) => page.waitForFunction(() => document.querySelectorAll("#savings-rank-tbody tr").length === 26, null, { timeout: 60000 });

test("three tiers for the user's place, then the capitals ranked by tax saved", { skip }, async () => {
  const page = await openApp({ query: `?tab=savings&${ZURICH}` });
  await rankRows(page);
  assert.equal(await page.inputValue("#savings-3a-input"), "7258");
  assert.equal(await page.locator("#savings-svg rect").count(), 3);
  assert.deepEqual(await texts(page, "#savings-tbody th"), ["No deduction", "With 3a", "With 3a + BVG buy-in"]);
  assert.match(await text(page, "#savings-chart-title"), /· 8001 Zürich · 2026$/);
  assert.match(await text(page, "#savings-limits"), /7'258.*36'288/);

  const saved = (await texts(page, "#savings-rank-tbody tr td:nth-child(5)")).map(t => Number(t.replace(/\D/g, "")));
  assert.deepEqual(saved, [...saved].sort((a, b) => b - a));
  assert.match(await text(page, "#savings-rank-tbody tr.row-you th"), /^Zürich \(ZH\)/);
  assert.deepEqual(page.errors, []);
});

test("a BVG amount reloads both parts; a location change keeps the ranking", { skip }, async () => {
  const page = await openApp({ query: `?tab=savings&${ZURICH}` });
  await rankRows(page);
  const urls = recordRequests(page, "savings");
  await settle(page, () => setInput(page, "#savings-bvg-input", 20000));
  await rankRows(page);
  assert.equal(urls.length, 2);
  assert.ok(urls.every(u => u.includes("bvg=20000")));
  assert.ok(urls[1].includes("scope=capitals"));
  assert.match((await texts(page, "#savings-tbody tr:nth-child(3) td"))[0], /^27'258$/);

  await settle(page, () => page.evaluate(async () => {
    const { setLocation } = await import("/js/controller.js");
    setLocation({ id: 630000000, name: "6300 Zug", bfsId: 1711, canton: "ZG" });
  }));
  await delay(300);
  assert.equal(urls.filter(u => u.includes("scope=capitals")).length, 1);
  assert.equal(urls.length, 3);
  assert.match(await text(page, "#savings-rank-tbody tr.row-you th"), /^Zug \(ZG\)/);
  assert.deepEqual(page.errors, []);
});

test("the tab is not fetched until it is shown", { skip }, async () => {
  const page = await openApp({ query: `?tab=overview&${ZURICH}` });
  const seen = recordRequests(page, "savings");
  await delay(300);
  assert.deepEqual(seen, []);
  await clickTab(page, "savings");
  await rankRows(page);
  assert.equal(seen.length, 2);
});
