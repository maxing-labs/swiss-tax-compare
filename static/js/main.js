import { I18N } from "./i18n/index.js";
import { esc } from "./format.js";
import { fetchLocations } from "./api.js";
import { state, loadActiveState, loadScenarios, parseKids, isCouple, saveActiveStateDebounced } from "./state.js";
import { incomeBase, selfEmployed3a } from "./calc.js";
import { showToast } from "./views/toast.js";
import { syncFormControlsFromState, updateMobileCollapseLabel } from "./views/controls.js";
import { renderCompare, exportCompareToCsv } from "./views/compare.js";
import {
  loadMeta,
  fetchAndRenderCalculation,
  onHouseholdChange,
  onCompareViewChange,
  onSavingsAmountChange,
  setLocation,
  switchTab,
  applyLanguage,
  saveScenario,
  applyScenario,
  deleteScenario
} from "./controller.js";

let kbLocationIdx = -1;
let locSearchTimer = null;
let locSearchCtrl = null;

function dict() {
  return I18N[state.lang] || I18N.en;
}

function bindLocationSearch() {
  const input = document.getElementById("location-search");
  const dropdown = document.getElementById("location-dropdown");

  const close = () => {
    dropdown.classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
    kbLocationIdx = -1;
  };

  const select = (li) => {
    setLocation({ id: li.dataset.id, name: li.dataset.name, bfsId: li.dataset.bfs, canton: li.dataset.canton });
    close();
  };

  const render = (locations, query) => {
    kbLocationIdx = -1;
    if (!locations.length) {
      dropdown.innerHTML = `<li class="no-match">${query.trim().length < 2 ? dict().locationTyping : dict().noLocationMatch}</li>`;
    } else {
      dropdown.innerHTML = locations.map((l, idx) => {
        const name = l.zip ? `${l.zip} ${l.city}` : l.city;
        return `<li role="option" data-idx="${idx}" data-id="${l.id}" data-bfs="${l.bfsId}" data-canton="${esc(l.canton)}" data-name="${esc(name)}">${esc(name)} <span class="match-meta-inline">${esc(l.canton)}</span></li>`;
      }).join("");
    }
    dropdown.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
  };

  input.addEventListener("input", () => {
    const q = input.value;
    clearTimeout(locSearchTimer);
    if (locSearchCtrl) locSearchCtrl.abort();
    if (q.trim().length < 2) {
      render([], q);
      return;
    }
    locSearchTimer = setTimeout(async () => {
      locSearchCtrl = new AbortController();
      try {
        const json = await fetchLocations(q.trim(), state.year, locSearchCtrl.signal);
        if (input.value !== q) return;
        render(json.locations || [], q);
      } catch (e) {
        if (e.name !== "AbortError") render([], q);
      }
    }, 250);
  });

  input.addEventListener("focus", () => input.select());

  input.addEventListener("keydown", (e) => {
    const items = Array.from(dropdown.querySelectorAll("li[data-id]"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length || dropdown.classList.contains("hidden")) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      kbLocationIdx = (kbLocationIdx + step + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle("kb-active", i === kbLocationIdx));
      items[kbLocationIdx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!dropdown.classList.contains("hidden") && items.length) select(items[kbLocationIdx >= 0 ? kbLocationIdx : 0]);
    } else if (e.key === "Escape") {
      close();
      input.value = state.locationName;
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      close();
      input.value = state.locationName;
    }, 180);
  });

  dropdown.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    e.preventDefault();
    select(li);
  });
}

// Numeric input: read on change, keep the last valid value otherwise
function bindNumber(id, key, { min = 0 } = {}) {
  const el = document.getElementById(id);
  el.addEventListener("change", () => {
    const v = Number(el.value);
    if (el.value === "" || isNaN(v) || v < min) {
      el.value = String(state[key]);
      return;
    }
    state[key] = Math.round(v);
    el.value = String(state[key]);
    onHouseholdChange();
  });
}

// 3a / BVG amounts of the savings view; they are not part of the household, so only that view reloads
function bindSavingsAmount(id, key) {
  const el = document.getElementById(id);
  el.addEventListener("change", () => {
    const v = Number(el.value);
    if (el.value === "" || isNaN(v) || v < 0) {
      el.value = String(state[key] ?? state.savings?.pillar3a ?? "");
      return;
    }
    state[key] = Math.round(v);
    el.value = String(state[key]);
    onSavingsAmountChange();
  });
}

function bindYob(id, key) {
  const el = document.getElementById(id);
  el.addEventListener("change", () => {
    const v = Number(el.value);
    const ok = Number.isInteger(v) && v >= 1900 && v <= state.year;
    el.classList.toggle("is-invalid", !ok);
    if (!ok) {
      showToast(dict().toastInvalidYob);
      return;
    }
    state[key] = v;
    onHouseholdChange();
  });
}

function bindSelect(id, key, { numeric = true } = {}) {
  const el = document.getElementById(id);
  el.addEventListener("change", () => {
    state[key] = numeric ? Number(el.value) : el.value;
    onHouseholdChange();
  });
}

function bindEvents() {
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => applyLanguage(btn.dataset.lang));
  });
  document.querySelectorAll(".nav-tabs button").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  const aboutDialog = document.getElementById("about-dialog");
  document.getElementById("btn-about").addEventListener("click", () => aboutDialog.showModal());
  document.getElementById("btn-about-close").addEventListener("click", () => aboutDialog.close());
  document.getElementById("btn-about-ok").addEventListener("click", () => aboutDialog.close());
  aboutDialog.addEventListener("click", (e) => {
    if (e.target === aboutDialog) aboutDialog.close();
  });

  document.getElementById("btn-save-scenario").addEventListener("click", saveScenario);
  document.getElementById("scenario-chips").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      deleteScenario(del.dataset.del);
      return;
    }
    const chip = e.target.closest("[data-sid]");
    if (chip) applyScenario(chip.dataset.sid);
  });
  document.getElementById("saved-cards-grid").addEventListener("click", (e) => {
    const card = e.target.closest("[data-sid]");
    if (card) applyScenario(card.dataset.sid);
  });

  document.getElementById("btn-toggle-filters").addEventListener("click", () => {
    state.mobileFiltersCollapsed = !state.mobileFiltersCollapsed;
    document.querySelector(".profile-bar").classList.toggle("is-collapsed", state.mobileFiltersCollapsed);
    updateMobileCollapseLabel();
  });

  bindLocationSearch();

  document.getElementById("year-select").addEventListener("change", (e) => {
    state.year = Number(e.target.value);
    for (const id of ["yob1-input", "yob2-input"]) document.getElementById(id).max = String(state.year);
    onHouseholdChange();
  });
  bindSelect("status-select", "status");
  bindSelect("type1-select", "type1");
  bindSelect("type2-select", "type2");
  bindSelect("conf1-select", "conf1");
  bindSelect("conf2-select", "conf2");
  bindNumber("inc1-input", "inc1");
  bindNumber("inc2-input", "inc2");
  bindNumber("taxable-input", "taxable");
  bindNumber("wealth-input", "wealth");
  bindYob("yob1-input", "yob1");
  bindYob("yob2-input", "yob2");

  const kidsInput = document.getElementById("kids-input");
  kidsInput.addEventListener("change", () => {
    const kids = parseKids(kidsInput.value);
    kidsInput.classList.toggle("is-invalid", kids === null);
    if (kids === null) {
      showToast(dict().toastInvalidKids);
      return;
    }
    state.kids = kids;
    kidsInput.value = kids.join(", ");
    onHouseholdChange();
  });

  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      state.mode = e.target.value;
      onHouseholdChange();
    });
  });

  document.querySelectorAll('input[name="scope"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      state.compareScope = e.target.value;
      document.getElementById("canton-select").classList.toggle("hidden", state.compareScope !== "canton");
      onCompareViewChange();
    });
  });
  document.getElementById("canton-select").addEventListener("change", (e) => {
    state.compareCanton = Number(e.target.value);
    onCompareViewChange();
  });
  document.getElementById("compare-filter").addEventListener("input", (e) => {
    state.compareQuery = e.target.value;
    state.showAllCompareRows = false;
    renderCompare();
  });
  document.getElementById("compare-sort").addEventListener("change", (e) => {
    state.compareSort = e.target.value;
    onCompareViewChange();
  });
  document.getElementById("btn-compare-load-more").addEventListener("click", () => {
    state.showAllCompareRows = !state.showAllCompareRows;
    renderCompare();
  });
  document.getElementById("btn-export-csv").addEventListener("click", exportCompareToCsv);

  document.getElementById("compare-tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-use-loc]");
    if (!btn) return;
    setLocation({ id: btn.dataset.useLoc, name: btn.dataset.city, bfsId: btn.dataset.bfs, canton: btn.dataset.canton });
    showToast(dict().toastLocationSet(btn.dataset.city));
    switchTab("overview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  bindSavingsAmount("savings-3a-input", "pillar3a");
  bindSavingsAmount("savings-bvg-input", "bvg");
  document.getElementById("btn-3a-pension").addEventListener("click", () => {
    state.pillar3a = null;
    onSavingsAmountChange();
  });
  document.getElementById("btn-3a-self").addEventListener("click", () => {
    const caps = state.savings?.caps || state.savingsRank?.caps;
    if (!caps) return;
    state.pillar3a = selfEmployed3a(caps, incomeBase(state));
    document.getElementById("savings-3a-input").value = String(state.pillar3a);
    onSavingsAmountChange();
  });

  document.getElementById("query-form").addEventListener("submit", (e) => e.preventDefault());
}

async function initApp() {
  loadActiveState();
  loadScenarios();
  bindEvents();
  await loadMeta();
  if (state.year > (state.meta?.maxYear || state.year)) state.year = state.meta.maxYear;
  syncFormControlsFromState();
  applyLanguage(state.lang);
  switchTab(state.activeTab);
  await fetchAndRenderCalculation();
}

document.addEventListener("DOMContentLoaded", initApp);
