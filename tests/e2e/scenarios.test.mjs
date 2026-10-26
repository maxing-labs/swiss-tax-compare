// Saved scenarios: save, switch, survive a reload, fill in late figures, delete
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close, settle, setInput, takeToasts, text, texts, delay, ZURICH } from "./lib.mjs";
import { fmtChf } from "../../static/js/format.js";

after(close);

const cards = (page) => texts(page, "#saved-cards-grid .saved-card");
const chips = (page) => texts(page, "#scenario-chips .p-chip-label");
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("swiss_tax_compare_scenarios_v1")));

test("save, save a second one, switch back by its card, reload, delete", { skip }, async () => {
  const page = await openApp({ query: `?tab=overview&${ZURICH}` });
  assert.ok(await page.locator("#saved-comparison-box").isHidden());
  assert.deepEqual(await chips(page), []);
  const single = await text(page, "#kpi-total");

  await page.click("#btn-save-scenario");
  assert.deepEqual(await takeToasts(page), ["Saved scenario: Zürich · Single · 100k · 2026"]);
  assert.match((await cards(page))[0], new RegExp(`^Zürich · Single · 100k · 2026 ● Active ${single} / yr \\d+\\.\\d% effective$`));

  // married with a second income: no scenario matches any more, saving makes a new one
  await settle(page, async () => {
    await page.selectOption("#status-select", "2");
    await setInput(page, "#inc2-input", 60000);
  });
  assert.equal(await page.locator("#saved-cards-grid .saved-card.active").count(), 0);
  const married = await text(page, "#kpi-total");
  await page.click("#btn-save-scenario");
  assert.deepEqual(await takeToasts(page), ["Saved scenario: Zürich · Married · 160k · 2026"]);
  assert.deepEqual(await chips(page), ["Zürich · Single · 100k · 2026", "Zürich · Married · 160k · 2026"]);
  assert.match((await cards(page))[0], /Switch → .* · [+−]CHF [\d']+ vs\. current$/);

  // back to the first one
  await settle(page, () => page.click("#saved-cards-grid .saved-card >> nth=0"));
  assert.equal(await page.inputValue("#status-select"), "1");
  assert.equal(await text(page, "#kpi-total"), single);
  assert.match((await cards(page))[1], new RegExp(`^Zürich · Married · 160k · 2026 Switch → ${married} / yr`));

  // the list and the active one survive a reload
  await settle(page, () => page.reload({ waitUntil: "domcontentloaded" }));
  assert.deepEqual(await chips(page), ["Zürich · Single · 100k · 2026", "Zürich · Married · 160k · 2026"]);
  assert.equal(await text(page, "#scenario-chips .p-chip.active .p-chip-label"), "Zürich · Single · 100k · 2026");

  // delete the married one by its chip
  await takeToasts(page);
  await page.click("#scenario-chips .p-chip >> nth=1 >> .p-chip-del");
  assert.deepEqual(await takeToasts(page), ["Scenario deleted"]);
  assert.deepEqual(await chips(page), ["Zürich · Single · 100k · 2026"]);
  assert.equal((await stored(page)).length, 1);

  // the last one can go too
  await page.click("#scenario-chips .p-chip-del");
  assert.deepEqual(await chips(page), []);
  assert.ok(await page.locator("#saved-comparison-box").isHidden());
  assert.deepEqual(page.errors, []);
});

test("saved while the calculation is running: the card fills in when the figures arrive", { skip }, async () => {
  const page = await openApp({ query: `?tab=overview&${ZURICH}` });
  await page.route("**/api/calculate?*inc1=130000*", async (r) => { await delay(1000); r.continue().catch(() => {}); });
  await settle(page, async () => {
    await setInput(page, "#inc1-input", 130000);
    await page.click("#btn-save-scenario");
    assert.deepEqual(await cards(page), ["Zürich · Single · 130k · 2026 ● Active — Not calculated yet"]);
    assert.equal((await stored(page))[0].summary, null);
  });
  const total = await text(page, "#kpi-total");
  assert.match((await cards(page))[0], new RegExp(`^Zürich · Single · 130k · 2026 ● Active ${total} / yr`));
  assert.equal(`CHF ${fmtChf((await stored(page))[0].summary.total)}`, total);
  assert.deepEqual(page.errors, []);
});
