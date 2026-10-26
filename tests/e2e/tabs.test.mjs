// Compare, curve and history fetch when first shown; an input change drops their data, a hidden tab refetches
// when it is shown again
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close, settle, setInput, clickTab, recordRequests, text, delay, ZURICH } from "./lib.mjs";

after(close);

const setLocation = (page, loc) => page.evaluate(async (loc) => {
  const { setLocation } = await import("/js/controller.js");
  setLocation(loc);
}, loc);
const ZUG = { id: 630000000, name: "6300 Zug", bfsId: 1711, canton: "ZG" };

test("lazy tabs fetch once when first shown and keep their data across tab switches", { skip }, async () => {
  const urls = { compare: [], curve: [], history: [] };
  const page = await openApp({
    query: `?tab=overview&${ZURICH}`,
    beforeGoto: (p) => { for (const k of Object.keys(urls)) urls[k] = recordRequests(p, k); }
  });
  assert.deepEqual([urls.compare.length, urls.curve.length, urls.history.length], [0, 0, 0]);

  for (const tab of ["compare", "curve", "history"]) await settle(page, () => clickTab(page, tab));
  await clickTab(page, "overview");
  for (const tab of ["compare", "curve", "history"]) await clickTab(page, tab);
  await delay(300);
  assert.deepEqual([urls.compare.length, urls.curve.length, urls.history.length], [1, 1, 1]);
  assert.deepEqual(page.errors, []);
});

test("a location change keeps the comparison (only the highlighted row moves), an income change refetches it", { skip }, async () => {
  // capitals only, so both places are in the table
  const page = await openApp({ query: `?tab=compare&scope=capitals&${ZURICH}` });
  const compare = recordRequests(page, "compare");
  const curve = recordRequests(page, "curve");
  assert.match(await text(page, "#compare-tbody tr.row-you th"), /^Zürich/);

  await settle(page, () => setLocation(page, ZUG));
  assert.deepEqual(compare, []);
  assert.match(await text(page, "#compare-tbody tr.row-you th"), /^Zug/);

  // an income change drops the comparison: it is fetched again right away because the tab is on screen
  await settle(page, () => setInput(page, "#inc1-input", 150000));
  assert.equal(compare.length, 1);
  assert.match(compare[0], /inc1=150000/);
  assert.deepEqual(curve, []);
});

test("a location change while the curve tab is hidden: the tab refetches when shown and draws at its own width", { skip }, async () => {
  const page = await openApp({ query: `?tab=curve&${ZURICH}`, phone: true });
  const curve = recordRequests(page, "curve");
  await clickTab(page, "overview");
  await settle(page, () => setLocation(page, ZUG));
  assert.deepEqual(curve, []);

  await settle(page, () => clickTab(page, "curve"));
  assert.equal(curve.length, 1);
  assert.match(curve[0], /loc=630000000/);
  assert.equal(await text(page, "#curve-chart-title"), "Effective and marginal tax rate by income · 6300 Zug");
  const { viewBoxWidth, width } = await page.evaluate(() => {
    const svg = document.getElementById("curve-svg");
    return { viewBoxWidth: Number(svg.getAttribute("viewBox").split(" ")[2]), width: Math.round(svg.getBoundingClientRect().width) };
  });
  assert.ok(width < 400, `phone width ${width}`);
  assert.equal(viewBoxWidth, width);
  assert.deepEqual(page.errors, []);
});

test("an answer that arrives after the inputs changed is not shown", { skip }, async () => {
  let first = true;
  const page = await openApp({
    query: `?tab=overview&${ZURICH}`,
    beforeGoto: (p) => p.route("**/api/curve?*", async (r) => {
      if (first) { first = false; await delay(1500); }
      r.continue().catch(() => {});
    })
  });
  // the curve for 100'000 is still on its way when the income changes and the user leaves the tab
  await clickTab(page, "curve");
  await clickTab(page, "overview");
  await settle(page, () => setInput(page, "#inc1-input", 130000));
  await delay(1800);
  assert.equal(await page.evaluate(async () => (await import("/js/state.js")).state.curve), null);

  await settle(page, () => clickTab(page, "curve"));
  assert.equal(await text(page, "#curve-tbody tr.row-you th"), "CHF 130'000you");
  assert.deepEqual(page.errors, []);
});
