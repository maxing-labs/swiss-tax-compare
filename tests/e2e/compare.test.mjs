// 02 Compare Places: the bar chart is drawn in its own pixel width, names above the bars on a phone
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close, settle, clickTab, ZURICH } from "./lib.mjs";

after(close);

const chart = (page) => page.evaluate(() => {
  const svg = document.getElementById("compare-svg");
  const labels = [...svg.querySelectorAll("text")].filter(t => t.textContent.includes(" · "));
  return {
    viewBoxWidth: Number(svg.getAttribute("viewBox").split(" ")[2]),
    width: Math.round(svg.getBoundingClientRect().width),
    bars: svg.querySelectorAll("rect").length,
    // beside the bar: right-aligned before it; above it: left-aligned at 0
    labelsBeside: labels.filter(t => t.getAttribute("text-anchor") === "end").length,
    labelsAbove: labels.filter(t => t.getAttribute("x") === "0").length
  };
});

test("desktop: 20 bars plus the user's place, names beside the bars", { skip }, async () => {
  const page = await openApp({ query: `?tab=compare&scope=all&${ZURICH}` });
  const c = await chart(page);
  assert.equal(c.viewBoxWidth, Math.min(820, c.width));
  assert.equal(c.bars, 21);
  assert.deepEqual([c.labelsBeside, c.labelsAbove], [21, 0]);
  assert.deepEqual(page.errors, []);
});

test("phone: names above the bars; redrawn at the phone width after a change made while the tab was hidden", { skip }, async () => {
  const page = await openApp({ query: `?tab=compare&scope=all&${ZURICH}`, phone: true });
  let c = await chart(page);
  assert.ok(c.width < 400, `phone width ${c.width}`);
  assert.equal(c.viewBoxWidth, c.width);
  assert.deepEqual([c.labelsBeside, c.labelsAbove], [0, 21]);

  // the location only moves the highlight: the hidden tab re-renders at the desktop width, then again when shown
  await clickTab(page, "overview");
  await settle(page, () => page.evaluate(async () => {
    const { setLocation } = await import("/js/controller.js");
    setLocation({ id: 630000000, name: "6300 Zug", bfsId: 1711, canton: "ZG" });
  }));
  assert.equal((await chart(page)).viewBoxWidth, 820);
  await clickTab(page, "compare");
  c = await chart(page);
  assert.equal(c.viewBoxWidth, c.width);
  assert.deepEqual([c.labelsBeside, c.labelsAbove], [0, c.bars]);
  assert.deepEqual(page.errors, []);
});
