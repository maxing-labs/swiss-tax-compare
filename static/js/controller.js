import { I18N } from "./i18n/index.js";
import { fetchMeta, fetchCalculation, fetchCompare } from "./api.js";
import { state, saveActiveStateToStorageAndUrl } from "./state.js";
import { showToast } from "./views/toast.js";
import { populateYearSelect, populateCantonSelect, updateFormClasses, updateMobileCollapseLabel } from "./views/controls.js";
import { renderOverview } from "./views/overview.js";
import { renderCompare } from "./views/compare.js";
import { renderGuideTab } from "./views/guide.js";

// Orchestration: fetch -> state -> views. main.js wires DOM events to these functions.

const inflight = { calc: { seq: 0, ctrl: null }, compare: { seq: 0, ctrl: null } };
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
  return load("calc", (signal) => fetchCalculation(state, signal), (json) => {
    state.calc = json;
    renderOverview();
  });
}

export function fetchAndRenderCompare() {
  return load("compare", (signal) => fetchCompare(state, signal), (json) => {
    state.compare = json;
    state.showAllCompareRows = false;
    renderCompare();
  });
}

// Any household input changed: recalculate, and refresh the comparison if it is on screen (else lazily)
export function onHouseholdChange({ locationOnly = false } = {}) {
  updateFormClasses();
  fetchAndRenderCalculation();
  if (locationOnly) {
    // the comparison does not depend on the location, only its highlighted row does
    if (state.compare) renderCompare();
    return;
  }
  state.compare = null;
  if (state.activeTab === "compare") fetchAndRenderCompare();
}

export function onCompareViewChange() {
  state.showAllCompareRows = false;
  saveActiveStateToStorageAndUrl();
  renderCompare();
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
  ["overview", "compare", "guide"].forEach(id => {
    document.getElementById(`view-${id}`).classList.toggle("hidden", id !== tabId);
  });
  saveActiveStateToStorageAndUrl();
  if (tabId === "compare" && !state.compare) fetchAndRenderCompare();
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
  if (state.calc) renderOverview();
  if (state.compare) renderCompare();
}
