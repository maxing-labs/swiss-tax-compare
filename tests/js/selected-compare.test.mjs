import { test } from "node:test";
import assert from "node:assert/strict";
import { selectedComparePlaces, state, readSnapshot, saveActiveStateToStorageAndUrl, loadActiveState } from "../../static/js/state.js";
import { afterTaxIncome } from "../../static/js/calc.js";

const own = { locationId: 800100000, locationName: "8001 Zürich", locationBfsId: 261, locationCanton: "ZH" };
const zug = { id: 630000000, name: "6300 Zug", bfsId: 1711, canton: "ZG" };

test("selected places: include the current place, deduplicate municipalities and cap at six", () => {
  const duplicates = [zug, { ...zug, id: 630100000, name: "6301 Zug" }, { id: 800200000, name: "8002 Zürich", bfsId: 261, canton: "ZH" }];
  const places = selectedComparePlaces({ ...own, comparePlaces: [...duplicates, null, { id: "bad" },
    ...Array.from({ length: 10 }, (_, i) => ({ id: i + 1, bfsId: i + 1, name: `City ${i}`, canton: "BE" }))] });
  assert.equal(places.length, 6);
  assert.equal(places[0].bfsId, 261);
  assert.equal(places[1].id, zug.id);
  assert.equal(new Set(places.map(p => p.bfsId)).size, 6);
  assert.equal(selectedComparePlaces({ ...own, locationBfsId: 1711, comparePlaces: [zug] }).length, 1);
});

test("selected places round-trip through storage and URL, and old stored rankings migrate to the new default", () => {
  const original = { ...state };
  const previousWindow = globalThis.window, previousStorage = globalThis.localStorage;
  let saved = null, url = "";
  globalThis.localStorage = { setItem: (_, v) => { saved = v; }, getItem: () => saved };
  globalThis.window = { location: { pathname: "/", search: "" }, history: { replaceState: (_, __, v) => { url = v; } } };
  try {
    Object.assign(state, own, { compareScope: "selected", comparePlaces: [zug] });
    saveActiveStateToStorageAndUrl();
    assert.deepEqual(JSON.parse(new URLSearchParams(url.split("?")[1]).get("places")), [zug]);
    state.comparePlaces = [];
    loadActiveState();
    assert.deepEqual(state.comparePlaces, [zug]);
    // URL takes precedence over another visitor's locally saved list.
    saved = JSON.stringify({ comparePlaces: [{ ...zug, bfsId: 1 }], compareScope: "all" });
    window.location.search = url.slice(url.indexOf("?"));
    loadActiveState();
    assert.deepEqual(state.comparePlaces, [zug]);
    window.location.search = "?loc=800100000";
    loadActiveState();
    assert.deepEqual(state.comparePlaces, []);
    assert.equal(state.compareScope, "selected");
    window.location.search = "";
    saved = JSON.stringify({ compareScope: "all" });
    loadActiveState();
    assert.equal(state.compareScope, "selected");
    readSnapshot({ comparePlaces: "not JSON" });
    assert.deepEqual(state.comparePlaces, []);
  } finally {
    Object.assign(state, original);
    globalThis.window = previousWindow;
    globalThis.localStorage = previousStorage;
  }
});

test("after-tax income follows the overview for a single person, a couple and taxable income", () => {
  const result = { total: 12000, p1: { net: 88000 }, p2: { net: 50000 } };
  assert.equal(afterTaxIncome(result, { mode: "gross", status: 1 }), 76000);
  assert.equal(afterTaxIncome(result, { mode: "gross", status: 2 }), 126000);
  assert.equal(afterTaxIncome(result, { mode: "taxable", taxable: 100000 }), 88000);
  assert.equal(afterTaxIncome({ ...result, total: 0 }, { mode: "taxable", taxable: 0 }), 0);
});

test("saveActiveStateToStorageAndUrl: skips no-op replaceState and halts rapid startup reload loops", () => {
  const original = { ...state };
  const prevWindow = globalThis.window, prevLocal = globalThis.localStorage, prevSession = globalThis.sessionStorage;
  const store = {}, session = {};
  let calls = 0;
  globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  globalThis.sessionStorage = { getItem: k => session[k] ?? null, setItem: (k, v) => { session[k] = v; } };
  globalThis.window = {
    location: { pathname: "/", search: "" },
    history: {
      replaceState: (_, __, url) => {
        calls++;
        const qIdx = url.indexOf("?");
        globalThis.window.location.search = qIdx >= 0 ? url.slice(qIdx) : "";
      }
    }
  };
  try {
    Object.assign(state, own);
    loadActiveState({ now: 1000 });
    saveActiveStateToStorageAndUrl({ startup: true });
    assert.equal(calls, 1);
    saveActiveStateToStorageAndUrl({ startup: true });
    saveActiveStateToStorageAndUrl();
    assert.equal(calls, 1);

    for (const t of [1200, 1400, 1600]) {
      globalThis.window.location.search = "";
      loadActiveState({ now: t });
      saveActiveStateToStorageAndUrl({ startup: true });
    }
    assert.equal(calls, 3);
    assert.equal(globalThis.window.location.search, "");

    saveActiveStateToStorageAndUrl();
    assert.equal(calls, 4);
    assert.match(globalThis.window.location.search, /loc=800100000/);
  } finally {
    Object.assign(state, original);
    globalThis.window = prevWindow;
    globalThis.localStorage = prevLocal;
    globalThis.sessionStorage = prevSession;
  }
});
