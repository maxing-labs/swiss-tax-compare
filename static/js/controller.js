import { I18N } from "./i18n/index.js";
import { fetchMeta, fetchCalculation, fetchCompare, fetchCurve, fetchHistory, fetchSavings } from "./api.js";
import {
  state,
  TABS,
  saveActiveStateToStorageAndUrl,
  householdSnapshot,
  sameHousehold,
  findActiveScenario,
  persistScenarios,
  readSnapshot
} from "./state.js";
import { scenarioSummary } from "./calc.js";
import { showToast } from "./views/toast.js";
import {
  populateYearSelect,
  populateCantonSelect,
  updateFormClasses,
  updateMobileCollapseLabel,
  syncFormControlsFromState
} from "./views/controls.js";
import { renderOverview } from "./views/overview.js";
import { renderCompare } from "./views/compare.js";
import { renderCurve } from "./views/curve.js";
import { renderHistory } from "./views/history.js";
import { renderSavings } from "./views/savings.js";
import { renderScenarios, scenarioLabel } from "./views/scenarios.js";
import { renderGuideTab } from "./views/guide.js";

// Orchestration: fetch -> state -> views. main.js wires DOM events to these functions.

// One slot per request kind; each kind keeps its result in state[kind]
const inflight = { calc: { seq: 0, ctrl: null }, compare: { seq: 0, ctrl: null }, curve: { seq: 0, ctrl: null },
  history: { seq: 0, ctrl: null }, savings: { seq: 0, ctrl: null }, savingsRank: { seq: 0, ctrl: null } };
let loadingCount = 0;
let lastFailed = false;

function setBadge() {
  const badge = document.getElementById("status-badge");
  const key = loadingCount > 0 ? "statusLoading" : lastFailed ? "statusError" : "statusReady";
  badge.dataset.i18n = key;
  badge.textContent = I18N[state.lang][key];
  badge.classList.toggle("loading", loadingCount > 0);
  badge.classList.toggle("error", loadingCount === 0 && lastFailed);
}

// Its inputs changed: drop the result and any running request, so a late answer cannot store stale data
function invalidate(kind) {
  const slot = inflight[kind];
  slot.seq++;
  if (slot.ctrl) slot.ctrl.abort();
  state[kind] = null;
}

// Runs `fetcher(signal)` for `kind`, dropping the result if a newer call superseded it
async function load(kind, fetcher, onData) {
  const slot = inflight[kind];
  const seq = ++slot.seq;
  if (slot.ctrl) slot.ctrl.abort();
  slot.ctrl = new AbortController();
  loadingCount++;
  setBadge();
  try {
    const json = await fetcher(slot.ctrl.signal);
    if (seq !== slot.seq) return;
    lastFailed = false;
    onData(json);
  } catch (e) {
    if (e.name === "AbortError") return;
    console.error(`${kind} failed:`, e);
    lastFailed = true;
    showToast(I18N[state.lang].toastLoadFailed);
  } finally {
    // every call counted itself in, superseded ones included
    loadingCount--;
    setBadge();
  }
}

export async function loadMeta() {
  try {
    state.meta = await fetchMeta();
  } catch (e) {
    console.error("meta failed:", e);
  }
  populateYearSelect();
  populateCantonSelect();
}

export function fetchAndRenderCalculation() {
  saveActiveStateToStorageAndUrl();
  updateMobileCollapseLabel();
  const inputs = householdSnapshot();
  return load("calc", (signal) => fetchCalculation(state, signal), (json) => {
    state.calc = json;
    state.calcInputs = inputs;
    // a saved scenario for these inputs shows the latest figures
    const saved = state.savedScenarios.find(s => sameHousehold(s, inputs));
    if (saved) {
      saved.summary = scenarioSummary(json);
      persistScenarios();
    }
    renderOverview();
    renderScenarios();
  });
}

export function fetchAndRenderCompare() {
  return load("compare", (signal) => fetchCompare(state, signal), (json) => {
    state.compare = json;
    state.showAllCompareRows = false;
    renderCompare();
  });
}

export function fetchAndRenderCurve() {
  return load("curve", (signal) => fetchCurve(state, signal), (json) => {
    state.curve = json;
    renderCurve();
  });
}

export function fetchAndRenderHistory() {
  return load("history", (signal) => fetchHistory(state, signal), (json) => {
    state.history = json;
    renderHistory();
  });
}

// Own place first, then the capitals' ranking: 26 x 3 more upstream requests, kept off the first paint
export async function fetchAndRenderSavings() {
  await load("savings", (signal) => fetchSavings(state, signal), (json) => {
    state.savings = json;
    renderSavings();
  });
  if (!state.savings || state.savingsRank) return;
  await load("savingsRank", (signal) => fetchSavings(state, signal, { capitals: true }), (json) => {
    state.savingsRank = json;
    renderSavings();
  });
}

// The 3a / BVG amounts changed
export function onSavingsAmountChange() {
  saveActiveStateToStorageAndUrl();
  invalidate("savings");
  invalidate("savingsRank");
  fetchAndRenderSavings();
}

// Tabs whose data is fetched when they are first shown
const LAZY_TABS = {
  compare: { fetch: fetchAndRenderCompare, render: renderCompare },
  curve: { fetch: fetchAndRenderCurve, render: renderCurve },
  history: { fetch: fetchAndRenderHistory, render: renderHistory },
  savings: { fetch: fetchAndRenderSavings, render: renderSavings }
};

function loadActiveTab() {
  const tab = LAZY_TABS[state.activeTab];
  if (tab && !state[state.activeTab]) tab.fetch();
}

// Any household input changed: recalculate, and refresh the tab on screen (the others lazily)
export function onHouseholdChange({ locationOnly = false } = {}) {
  updateFormClasses();
  renderScenarios();
  fetchAndRenderCalculation();
  if (locationOnly) {
    // the comparison and the ranking do not depend on the location, only their highlighted row does
    if (state.compare) renderCompare();
    if (state.savingsRank) renderSavings();
  } else {
    invalidate("compare");
    invalidate("savingsRank");
  }
  invalidate("curve");
  invalidate("history");
  invalidate("savings");
  loadActiveTab();
}

export function onCompareViewChange() {
  state.showAllCompareRows = false;
  saveActiveStateToStorageAndUrl();
  renderCompare();
}

// Saves the inputs on screen, or updates the scenario they already belong to
export function saveScenario() {
  const dict = I18N[state.lang];
  const calcIsCurrent = state.calc && state.calcInputs && sameHousehold(state.calcInputs, state);
  const summary = calcIsCurrent ? scenarioSummary(state.calc) : null;
  const existing = findActiveScenario();
  if (existing) {
    Object.assign(existing, householdSnapshot(), { summary: summary || existing.summary });
    showToast(dict.toastSavedUpdate(scenarioLabel(existing, dict)));
  } else {
    const created = { id: `s_${Date.now()}`, ...householdSnapshot(), summary };
    state.savedScenarios.push(created);
    showToast(dict.toastSavedNew(scenarioLabel(created, dict)));
  }
  persistScenarios();
  renderScenarios();
}

export function applyScenario(id) {
  const s = state.savedScenarios.find(x => x.id === id);
  if (!s || sameHousehold(s, state)) return;
  readSnapshot(s);
  syncFormControlsFromState();
  onHouseholdChange();
}

export function deleteScenario(id) {
  state.savedScenarios = state.savedScenarios.filter(x => x.id !== id);
  persistScenarios();
  renderScenarios();
  showToast(I18N[state.lang].toastDeleted);
}

export function setLocation({ id, name, bfsId, canton }) {
  state.locationId = Number(id);
  state.locationName = name;
  state.locationBfsId = Number(bfsId);
  state.locationCanton = canton || "";
  document.getElementById("location-search").value = name;
  onHouseholdChange({ locationOnly: true });
}

export function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll(".nav-tabs li").forEach(li => {
    const btn = li.querySelector("button");
    const isMatch = btn.dataset.tab === tabId;
    li.classList.toggle("active", isMatch);
    btn.setAttribute("aria-selected", isMatch);
  });
  TABS.forEach(id => {
    document.getElementById(`view-${id}`).classList.toggle("hidden", id !== tabId);
  });
  saveActiveStateToStorageAndUrl();
  // charts take the width of the visible tab: redraw what was rendered while hidden
  if (LAZY_TABS[tabId] && state[tabId]) LAZY_TABS[tabId].render();
  else loadActiveTab();
}

export function applyLanguage(lang) {
  state.lang = I18N[lang] ? lang : "en";
  const dict = I18N[state.lang];

  document.documentElement.lang = dict.htmlLang;
  document.title = dict.docTitle;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (dict[key] && typeof dict[key] === "string") el.textContent = dict[key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (dict[key]) el.setAttribute("placeholder", dict[key]);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => {
    const key = el.getAttribute("data-i18n-aria");
    if (dict[key]) el.setAttribute("aria-label", dict[key]);
  });
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === state.lang);
  });

  renderGuideTab();
  updateMobileCollapseLabel();
  setBadge();
  saveActiveStateToStorageAndUrl();
  renderScenarios();
  if (state.calc) renderOverview();
  if (state.compare) renderCompare();
  if (state.curve) renderCurve();
  if (state.history) renderHistory();
  if (state.savings) renderSavings();
}
