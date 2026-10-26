// 04 History: every year 2010-2026 for today's inputs; a year without data breaks the line
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close, settle, texts, ZURICH } from "./lib.mjs";
import { fmtSignedChf } from "../../static/js/format.js";

after(close);

const rowOf = (page, year) => page.evaluate((year) => {
  const tr = [...document.querySelectorAll("#history-tbody tr")].find(tr => tr.querySelector("th").textContent === String(year));
  return tr && { cells: [...tr.querySelectorAll("td")].map(td => td.textContent.trim()), you: tr.classList.contains("row-you") };
}, year);

test("one row per year, newest first; the selected year is highlighted and follows the year select", { skip }, async () => {
  const page = await openApp({ query: `?tab=history&${ZURICH}` });
  const years = await texts(page, "#history-tbody th");
  assert.deepEqual(years, Array.from({ length: 17 }, (_, i) => String(2026 - i)));
  assert.deepEqual(await texts(page, "#history-tbody tr.row-you th"), ["2026"]);
  assert.equal(await page.locator("#history-svg polyline").count(), 1);
  assert.equal(await page.locator('#history-svg circle[r="6"]').count(), 1);
  assert.equal((await rowOf(page, 2010)).cells[1], "—");

  await settle(page, () => page.selectOption("#year-select", "2018"));
  assert.deepEqual(await texts(page, "#history-tbody tr.row-you th"), ["2018"]);
  assert.equal(await page.locator("#history-tbody tr").count(), 17);
  assert.deepEqual(page.errors, []);
});

test("a year without data: the line breaks, the table says so and the next year compares with the last known one", { skip }, async () => {
  let totals;
  const page = await openApp({
    query: `?tab=history&${ZURICH}`,
    beforeGoto: (p) => p.route("**/api/history?*", async (route) => {
      const res = await route.fetch();
      if (!res.ok()) return route.fulfill({ response: res });
      const json = await res.json();
      json.points.find(pt => pt.year === 2015).total = null;
      totals = Object.fromEntries(json.points.map(pt => [pt.year, pt.total]));
      await route.fulfill({ response: res, json });
    })
  });
  assert.equal(await page.locator("#history-svg polyline").count(), 2);
  assert.equal(await page.locator("#history-svg circle").count(), 16);
  assert.deepEqual((await rowOf(page, 2015)).cells, ["no data", "—"]);

  assert.equal((await rowOf(page, 2016)).cells[1].split(" ")[0], fmtSignedChf(totals[2016] - totals[2014]));
  assert.deepEqual(page.errors, []);
});
