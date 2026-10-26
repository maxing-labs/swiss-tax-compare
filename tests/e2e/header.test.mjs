// Phone header: the title, the status badge and the buttons stay apart in every language and badge state
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close } from "./lib.mjs";

after(close);

test("phone header: nothing overlaps at 360 and 390 px", { skip }, async () => {
  const page = await openApp({ query: "?tab=overview", phone: true });
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const lang of ["en", "de", "zh"]) {
      await page.click(`.lang-btn[data-lang="${lang}"]`);
      for (const key of ["statusReady", "statusLoading", "statusError"]) {
        // the badge's look depends only on its class and text, so set those directly
        const m = await page.evaluate(async ([lang, key]) => {
          const { I18N } = await import("/js/i18n/index.js");
          const b = document.getElementById("status-badge");
          b.textContent = I18N[lang][key];
          b.classList.toggle("loading", key === "statusLoading");
          b.classList.toggle("error", key === "statusError");
          const box = (sel) => document.querySelector(sel).getBoundingClientRect();
          return { title: box(".brand h1").right, badge: box("#status-badge").left, lang: box(".lang-switch").right,
            page: document.documentElement.scrollWidth };
        }, [lang, key]);
        const at = `${width}px ${lang} ${key}`;
        assert.ok(m.title < m.badge, `${at}: title ends at ${m.title}, badge starts at ${m.badge}`);
        assert.ok(m.lang <= width, `${at}: language switch ends at ${m.lang}`);
        assert.equal(m.page, width, `${at}: page scrolls sideways`);
      }
    }
  }
  assert.deepEqual(page.errors, []);
});
