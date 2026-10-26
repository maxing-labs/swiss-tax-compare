// German and Chinese: no English dictionary text left anywhere on the page, attributes included
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { skip, openApp, close, settle, clickTab, texts, ZURICH } from "./lib.mjs";

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
    const page = await openApp({ query: `?tab=overview&scope=all&lang=${lang}&status=2&inc2=60000&kids=4,9` });
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

const CHART_TABS = ["compare", "curve", "history"];
const chartTitles = (page) => texts(page, CHART_TABS.map(tab => `#${tab}-chart-title`).join(", "));

// The title each chart tab shows before its first load: the dictionary's placeholder
const placeholders = (page, lang) => page.evaluate(async ([lang, tabs]) => {
  const dict = (await import("/js/i18n/index.js")).I18N[lang];
  return tabs.map(tab => dict[`${tab}ChartPlaceholder`]);
}, [lang, CHART_TABS]);

// The titles render() writes once the tabs have loaded, with the place
const loadedTitles = (page, lang) => page.evaluate(async (lang) => {
  const dict = (await import("/js/i18n/index.js")).I18N[lang];
  const { state } = await import("/js/state.js");
  const { visiblePlaces, CHART_BARS } = await import("/js/views/compare.js");
  const years = state.history.points.map(p => p.year);
  return [
    dict.compareChartTitle(Math.min(CHART_BARS, visiblePlaces().list.length)),
    dict.curveChartTitle(state.locationName),
    dict.historyChartTitle(state.locationName, years[0], years.at(-1)),
  ];
}, lang);

test("chart titles are translated before their tab first loads, and keep the place after a language switch", { skip }, async () => {
  const page = await openApp({ query: `?tab=overview&scope=all&lang=de&${ZURICH}` });
  // each tab's request waits until its title has been read
  let gate = Promise.resolve();
  await page.route(/\/api\/(compare|curve|history)\?/, async (route) => { await gate; route.fallback().catch(() => {}); });
  const shownWhileLoading = async (tab) => {
    let release;
    gate = new Promise((res) => { release = res; });
    let title;
    await settle(page, async () => {
      await clickTab(page, tab);
      title = (await chartTitles(page))[CHART_TABS.indexOf(tab)];
      release();
    });
    return title;
  };

  const de = await placeholders(page, "de");
  assert.equal(await shownWhileLoading("compare"), de[0]);
  assert.equal(await shownWhileLoading("curve"), de[1]);
  // switched before the history tab has loaded: its placeholder follows
  await page.click('.lang-btn[data-lang="zh"]');
  assert.equal(await shownWhileLoading("history"), (await placeholders(page, "zh"))[2]);

  assert.deepEqual(await chartTitles(page), await loadedTitles(page, "zh"));
  assert.match((await chartTitles(page))[1], /8001 Zürich/);
  await page.click('.lang-btn[data-lang="de"]');
  assert.deepEqual(await chartTitles(page), await loadedTitles(page, "de"));
  assert.deepEqual(page.errors, []);
});
