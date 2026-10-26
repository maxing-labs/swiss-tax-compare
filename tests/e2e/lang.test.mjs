// German and Chinese: no English dictionary text left anywhere on the page, attributes included
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close, settle, clickTab } from "./lib.mjs";

after(close);

// English strings of the dictionary that the other language translates, found in text or attributes
const englishLeftovers = (page, lang) => page.evaluate(async (lang) => {
  const { I18N } = await import("/js/i18n/index.js");
  const en = I18N.en, other = I18N[lang];
  const english = new Set(Object.keys(en).filter(k => typeof en[k] === "string" && en[k] !== other[k] && en[k].length > 2).map(k => en[k]));
  const found = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!el || el.closest("script")) continue;
    const txt = walker.currentNode.textContent.trim();
    if (english.has(txt)) found.add(`<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}> ${txt}`);
  }
  for (const el of document.querySelectorAll("[placeholder], [aria-label], [title]")) {
    for (const attr of ["placeholder", "aria-label", "title"]) {
      if (english.has(el.getAttribute(attr))) found.add(`@${attr} ${el.getAttribute(attr)}`);
    }
  }
  return [...found].sort();
}, lang);

for (const lang of ["de", "zh"]) {
  test(`${lang}: every tab, the saved scenario cards and the About dialog are translated`, { skip }, async () => {
    // a couple with children and a saved scenario, so the second person, the chips and the cards are on screen
    const page = await openApp({ query: `?tab=overview&lang=${lang}&status=2&inc2=60000&kids=4,9` });
    await page.click("#btn-save-scenario");
    for (const tab of ["compare", "curve", "history"]) await settle(page, () => clickTab(page, tab));
    await clickTab(page, "guide");
    await page.click("#btn-about");

    const dict = await page.evaluate(async (lang) => {
      const { I18N } = await import("/js/i18n/index.js");
      return { htmlLang: I18N[lang].htmlLang, docTitle: I18N[lang].docTitle };
    }, lang);
    assert.equal(await page.getAttribute("html", "lang"), dict.htmlLang);
    assert.equal(await page.title(), dict.docTitle);
    assert.deepEqual(await englishLeftovers(page, lang), []);
    assert.deepEqual(page.errors, []);
  });
}
