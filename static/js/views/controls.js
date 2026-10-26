import { I18N } from "../i18n/index.js";
import { state, isCouple, minYear, maxYear } from "../state.js";

export function populateYearSelect() {
  const sel = document.getElementById("year-select");
  const opts = [];
  for (let y = maxYear(); y >= minYear(); y--) opts.push(`<option value="${y}">${y}</option>`);
  sel.innerHTML = opts.join("");
  sel.value = String(state.year);
  for (const id of ["yob1-input", "yob2-input"]) document.getElementById(id).max = String(state.year);
}

export function populateCantonSelect() {
  const sel = document.getElementById("canton-select");
  const cantons = state.meta?.cantons || [];
  sel.innerHTML = cantons.map(c => `<option value="${c.id}">${c.abbr}</option>`).join("");
  sel.value = String(state.compareCanton);
}

export function updateFormClasses() {
  const form = document.getElementById("query-form");
  form.classList.toggle("mode-gross", state.mode === "gross");
  form.classList.toggle("mode-taxable", state.mode === "taxable");
  form.classList.toggle("is-couple", isCouple());
}

export function syncFormControlsFromState() {
  const set = (id, v) => { document.getElementById(id).value = String(v); };
  set("location-search", state.locationName);
  set("year-select", state.year);
  set("status-select", state.status);
  set("kids-input", state.kids.join(", "));
  set("wealth-input", state.wealth);
  document.querySelectorAll('input[name="mode"]').forEach(r => { r.checked = r.value === state.mode; });
  set("type1-select", state.type1);
  set("inc1-input", state.inc1);
  set("taxable-input", state.taxable);
  set("yob1-input", state.yob1);
  set("conf1-select", state.conf1);
  set("type2-select", state.type2);
  set("inc2-input", state.inc2);
  set("yob2-input", state.yob2);
  set("conf2-select", state.conf2);
  for (const id of ["yob1-input", "yob2-input", "kids-input"]) document.getElementById(id).classList.remove("is-invalid");
  document.querySelectorAll('input[name="scope"]').forEach(r => { r.checked = r.value === state.compareScope; });
  set("canton-select", state.compareCanton);
  document.getElementById("canton-select").classList.toggle("hidden", state.compareScope !== "canton");
  set("compare-sort", state.compareSort);
  set("compare-filter", state.compareQuery);
  updateFormClasses();
  updateMobileCollapseLabel();
}

export function updateMobileCollapseLabel() {
  const dict = I18N[state.lang] || I18N.en;
  const span = document.getElementById("mobile-filter-summary");
  const btn = document.getElementById("btn-toggle-filters");
  if (!span || !btn) return;
  if (state.mobileFiltersCollapsed) {
    const city = (state.locationName || "").replace(/^\d{4}\s+/, "").split(" ")[0];
    const inc = state.mode === "gross" ? state.inc1 + (isCouple() ? state.inc2 : 0) : state.taxable;
    span.textContent = `${city} · ${state.year} · ${dict.profileIncomeShort(inc)} · ${dict.mobileCollapseClosed}`;
    btn.setAttribute("aria-expanded", "false");
  } else {
    span.textContent = dict.mobileCollapseOpen;
    btn.setAttribute("aria-expanded", "true");
  }
}
