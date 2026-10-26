import { I18N } from "../i18n/index.js";
import { fmtChf, fmtPct, esc } from "../format.js";
import { rankSavings } from "../calc.js";
import { state } from "../state.js";
import { CHART_THEME, chartWidth } from "./chart-theme.js";

const TIER_KEYS = ["savingsTierNone", "savingsTierPillar3a", "savingsTierBoth"];

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

export function renderSavings() {
  const dict = I18N[state.lang] || I18N.en;
  const own = state.savings;
  const rank = state.savingsRank;
  const data = own || rank;
  if (!data) return;
  syncInputs(data);
  setText("savings-method-note", data.method === "budget" ? dict.savingsMethodBudget : dict.savingsMethodTaxable);
  setText("savings-limits", dict.savingsLimits(data.caps.withPension, data.caps.selfEmployed));
  if (own) {
    setText("savings-chart-title", dict.savingsChartTitle(state.locationName, own.household.year));
    renderChart(own, dict);
    renderTiers(own, dict);
  }
  if (rank) {
    setText("savings-rank-title", dict.savingsRankTitle(rank.rows.length));
    renderRanking(rank, dict);
  }
}

// An amount left at its default shows the limit the API used
function syncInputs(data) {
  const p3a = document.getElementById("savings-3a-input");
  if (state.pillar3a === null && document.activeElement !== p3a) p3a.value = String(data.pillar3a);
}

function renderChart(data, dict) {
  const svg = document.getElementById("savings-svg");
  const W = chartWidth(svg);
  const stacked = W < 560;
  const rowH = stacked ? 46 : 38;
  const padT = 8, padB = 8, padL = stacked ? 0 : 190, padR = stacked ? 8 : 150;
  const H = padT + data.tiers.length * rowH + padB;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const maxV = Math.max(...data.tiers.map(t => t.total), 1);
  const plotW = W - padL - padR;
  const parts = [];
  data.tiers.forEach((t, i) => {
    const y = padT + i * rowH;
    const color = i === 0 ? CHART_THEME.ink : CHART_THEME.accent;
    const label = dict[TIER_KEYS[i]];
    const w = Math.max(1, (t.total / maxV) * plotW);
    const barY = stacked ? y + 18 : y + 8;
    const saved = t.saved > 0 ? ` · −${fmtChf(t.saved)}` : "";
    parts.push(stacked
      ? `<text x="0" y="${y + 13}" font-size="12" font-weight="700" fill="${color}">${esc(label)}</text>`
      : `<text x="${padL - 8}" y="${y + 21}" text-anchor="end" font-size="12" font-weight="700" fill="${color}">${esc(label)}</text>`);
    parts.push(`<rect x="${padL}" y="${barY}" width="${w.toFixed(1)}" height="18" fill="${color}" opacity="${i === 0 ? 0.82 : 1}"><title>${esc(label)}: CHF ${fmtChf(t.total)}${saved}</title></rect>`);
    // the label sits inside a bar that is wide enough, else after it
    const inside = w > (stacked ? 150 : 170);
    parts.push(`<text x="${inside ? padL + w - 6 : padL + w + 6}" y="${barY + 13}" text-anchor="${inside ? "end" : "start"}" font-size="12" font-weight="700" fill="${inside ? "#fff" : color}">${fmtChf(t.total)}${saved}</text>`);
  });
  svg.innerHTML = parts.join("");
}

function renderTiers(data, dict) {
  document.getElementById("savings-thead").innerHTML = `
    <tr>
      <th scope="col">${dict.thScenario}</th>
      <th scope="col" class="num-col">${dict.thDeductionAmount}</th>
      <th scope="col" class="num-col highlight-col">${dict.thTotalTax}</th>
      <th scope="col" class="num-col">${dict.thSaved}</th>
      <th scope="col" class="num-col">${dict.thPerFranc}</th>
    </tr>
  `;
  document.getElementById("savings-tbody").innerHTML = data.tiers.map((t, i) => `
    <tr>
      <th scope="row">${dict[TIER_KEYS[i]]}</th>
      <td class="num-col" data-label="${dict.thDeductionAmount}">${fmtChf(t.deduction)}</td>
      <td class="num-col highlight-col" data-label="${dict.thTotalTax}">CHF ${fmtChf(t.total)}</td>
      <td class="num-col diff-neg" data-label="${dict.thSaved}">${t.saved > 0 ? `CHF ${fmtChf(t.saved)}` : "—"}</td>
      <td class="num-col" data-label="${dict.thPerFranc}">${t.perFranc === null ? "—" : `CHF ${fmtChf(t.perFranc, 2)}`}</td>
    </tr>
  `).join("");
}

function renderRanking(data, dict) {
  document.getElementById("savings-rank-thead").innerHTML = `
    <tr>
      <th scope="col">${dict.thRank}</th>
      <th scope="col">${dict.thPlace}</th>
      <th scope="col" class="num-col">${dict.savingsTierNone}</th>
      <th scope="col" class="num-col">${dict.thSaved3a}</th>
      <th scope="col" class="num-col highlight-col">${dict.thSavedBoth}</th>
      <th scope="col" class="num-col">${dict.thSavedShare}</th>
    </tr>
  `;
  document.getElementById("savings-rank-tbody").innerHTML = rankSavings(data.rows, state.locationBfsId).map((r, i) => {
    const [none, p3a, both] = r.tiers;
    const share = none.total > 0 ? (both.saved / none.total) * 100 : null;
    return `
      <tr class="${r.isYou ? "row-you" : ""}">
        <td data-label="${dict.thRank}">${i + 1}</td>
        <th scope="row">${esc(r.loc.city)} (${esc(r.loc.canton)})${r.isYou ? `<span class="you-badge">${dict.yourPlaceBadge}</span>` : ""}</th>
        <td class="num-col" data-label="${dict.savingsTierNone}">CHF ${fmtChf(none.total)}</td>
        <td class="num-col" data-label="${dict.thSaved3a}">${fmtChf(p3a.saved)}</td>
        <td class="num-col highlight-col" data-label="${dict.thSavedBoth}">CHF ${fmtChf(both.saved)}</td>
        <td class="num-col" data-label="${dict.thSavedShare}">${fmtPct(share)}</td>
      </tr>
    `;
  }).join("");
}
