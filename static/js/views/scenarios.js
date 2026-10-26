import { I18N } from "../i18n/index.js";
import { fmtChf, fmtPct, esc } from "../format.js";
import { state, isCouple, findActiveScenario } from "../state.js";

// "Zürich · Married · 2 kids · 150k · 2026"
export function scenarioLabel(s, dict) {
  const city = (s.locationName || "").replace(/^\d{4}\s+/, "");
  const parts = [city, dict.statusShort[s.status]];
  if (s.kids.length) parts.push(dict.kidsShort(s.kids.length));
  parts.push(s.mode === "gross"
    ? dict.profileIncomeShort(s.inc1 + (isCouple(s.status) ? s.inc2 : 0))
    : dict.taxableIncomeShort(s.taxable));
  parts.push(String(s.year));
  return parts.join(" · ");
}

export function renderScenarios() {
  const dict = I18N[state.lang] || I18N.en;
  const list = state.savedScenarios;
  const active = findActiveScenario();
  // the figures on screen, which the cards are compared against
  const current = state.calc?.result?.total ?? null;

  document.getElementById("scenario-chips").innerHTML = list.map(s => `
    <div class="p-chip ${s === active ? "active" : ""}">
      <button type="button" class="p-chip-label" data-sid="${esc(s.id)}">${esc(scenarioLabel(s, dict))}</button>
      <button type="button" class="p-chip-del" data-del="${esc(s.id)}" title="${dict.delProfileTitle}" aria-label="${dict.delProfileTitle}">✕</button>
    </div>
  `).join("");

  document.getElementById("saved-comparison-box").classList.toggle("hidden", list.length === 0);
  document.getElementById("saved-cards-grid").innerHTML = list.map(s => {
    const isActive = s === active;
    const sum = s.summary;
    const diff = sum && current !== null && !isActive ? sum.total - current : null;
    const diffCls = diff > 0 ? "diff-pos" : diff < 0 ? "diff-neg" : "";
    return `
      <button type="button" class="saved-card ${isActive ? "active" : ""}" data-sid="${esc(s.id)}">
        <span class="saved-card-head">
          <span>${esc(scenarioLabel(s, dict))}</span>
          <span>${isActive ? dict.activeProfileBadge : dict.switchProfileBadge}</span>
        </span>
        <span class="saved-card-price">${sum ? `CHF ${fmtChf(sum.total)} <small>${dict.perYear}</small>` : "—"}</span>
        <span class="saved-card-sub">${sum
          ? `${dict.effectiveShort(fmtPct(sum.effective))}${diff === null ? "" : ` · <span class="${diffCls}">${dict.diffVsCurrent(diff)}</span>`}`
          : dict.notCachedYet}</span>
      </button>
    `;
  }).join("");
}
