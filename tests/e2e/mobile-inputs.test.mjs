// Phones: open inputs scroll away with the page, collapsed ones stick to the top with a shadow
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close, ZURICH } from "./lib.mjs";

after(close);

const header = (page) => page.evaluate(() => {
  const h = document.querySelector(".swiss-header");
  const r = h.getBoundingClientRect();
  const css = getComputedStyle(h);
  return { position: css.position, shadow: css.boxShadow !== "none", top: Math.round(r.top), height: Math.round(r.height) };
});
const scrollTo = (page, y) => page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);

test("phone: open inputs scroll away; collapsed, the header sticks with a shadow; reopening scrolls back up", { skip }, async () => {
  // a couple, the tallest form
  const page = await openApp({ query: `?tab=overview&${ZURICH.replace("status=1", "status=2")}&inc2=60000`, phone: true });
  let h = await header(page);
  assert.deepEqual([h.position, h.shadow], ["static", false]);
  await scrollTo(page, h.height + 100);
  assert.ok((await header(page)).top < -h.height, "the open header scrolled out of view");

  await scrollTo(page, 0);
  await page.click("#btn-toggle-filters");
  h = await header(page);
  assert.deepEqual([h.position, h.shadow], ["sticky", true]);
  assert.ok(h.height < 200, `collapsed header ${h.height}px`);
  await scrollTo(page, 800);
  assert.equal((await header(page)).top, 0);

  // reopened far down the page: the inputs come into view
  await page.click("#btn-toggle-filters");
  await page.waitForFunction(() => window.scrollY === 0);
  h = await header(page);
  assert.deepEqual([h.position, h.top], ["static", 0]);
  assert.ok(await page.locator("#inc2-input").isVisible());
  assert.deepEqual(page.errors, []);
});

test("desktop: the header with the inputs stays sticky, without a shadow", { skip }, async () => {
  const page = await openApp({ query: `?tab=overview&${ZURICH}` });
  await scrollTo(page, 600);
  const h = await header(page);
  assert.deepEqual([h.position, h.shadow, h.top], ["sticky", false, 0]);
});
