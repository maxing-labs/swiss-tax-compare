import { I18N } from "../i18n/index.js";
import { fmtChf, fmtPct, fmtSignedChf, esc } from "../format.js";
import { filterPlaces, rankPlaces, rankOf, median, incomeBase, effectiveRate, wealthTaxOf } from "../calc.js";
import { state } from "../state.js";
import { CHART_THEME } from "./chart-theme.js";

const DEFAULT_LIMIT = 50;
const CHART_BARS = 20;

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function placeName(row) {
  return `${row.loc.city} (${row.loc.canton})`;
}

// The rows the table shows, in order, with the difference to the user's own place
export function visiblePlaces() {
  const rows = state.compare?.rows || [];
  const scope = state.compare?.scope === "capitals" ? "capitals" : state.compareScope;
  const filtered = filterPlaces(rows, { scope, cantonId: state.compareCanton, query: state.compareQuery });
  return rankPlaces(filtered, state.locationBfsId, state.compareSort);
}

export function renderCompare() {
  const dict = I18N[state.lang] || I18N.en;
  const data = state.compare;
  if (!data?.rows) return;
  const capitalsOnly = data.scope === "capitals";
  document.getElementById("scope-note").classList.toggle("hidden", !capitalsOnly);
  document.getElementById("scope-seg").classList.toggle("hidden", capitalsOnly);
  document.getElementById("canton-select").classList.toggle("hidden", capitalsOnly || state.compareScope !== "canton");

  const { list } = visiblePlaces();
  const own = list.find(r => r.isYou) || null;
  const base = incomeBase(data.household);
  const asc = [...list].sort((a, b) => a.total - b.total);
  renderKpis(asc, own, dict);
  renderChart(asc, own, dict);
  renderTable(list, base, dict);
}

function renderKpis(asc, own, dict) {
  if (!asc.length) {
    for (const id of ["kpi-cheapest", "kpi-cheapest-sub", "kpi-rank", "kpi-rank-sub", "kpi-saving", "kpi-saving-sub", "kpi-median"]) setText(id, "—");
    return;
  }
  const cheapest = asc[0];
  setText("kpi-cheapest", `CHF ${fmtChf(cheapest.total)}`);
  setText("kpi-cheapest-sub", placeName(cheapest));
  const rank = own ? rankOf(asc, own.loc.bfsId) : null;
  setText("kpi-rank", rank ? `#${rank}` : "—");
  setText("kpi-rank-sub", rank ? dict.kpiYourRankSub(asc.length) : dict.kpiRankNotInList);
  if (own) {
    const saving = own.total - cheapest.total;
    setText("kpi-saving", `CHF ${fmtChf(saving)}`);
    setText("kpi-saving-sub", saving > 0 ? dict.kpiMaxSavingSub(placeName(cheapest)) : dict.kpiAlreadyCheapest);
  } else {
    setText("kpi-saving", "—");
    setText("kpi-saving-sub", dict.kpiRankNotInList);
  }
  setText("kpi-median", `CHF ${fmtChf(median(asc.map(r => r.total)))}`);
}

function renderChart(asc, own, dict) {
  const svg = document.getElementById("compare-svg");
  const bars = asc.slice(0, CHART_BARS);
  if (own && !bars.some(r => r.isYou)) bars.push(own);
  setText("compare-chart-title", dict.compareChartTitle(Math.min(CHART_BARS, asc.length)));
  if (!bars.length) {
    svg.innerHTML = "";
    return;
  }
  const W = 820;
  const rowH = 22;
  const padT = 8, padB = 26, padL = 200, padR = 90;
  const H = padT + bars.length * rowH + padB;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const maxV = Math.max(...bars.map(r => r.total), 1);
  const plotW = W - padL - padR;
  const scaleX = (v) => padL + (v / maxV) * plotW;
  const parts = [];
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = (maxV * i) / ticks;
    const x = scaleX(v);
    parts.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${H - padB + 4}" stroke="${CHART_THEME.grid}" stroke-width="1" />`);
    parts.push(`<text x="${x}" y="${H - padB + 18}" text-anchor="middle" font-size="11" fill="${CHART_THEME.axisText}">${fmtChf(v)}</text>`);
  }
  bars.forEach((r, i) => {
    const y = padT + i * rowH;
    const w = Math.max(1, scaleX(r.total) - padL);
    const color = r.isYou ? CHART_THEME.accent : CHART_THEME.ink;
    const label = `${esc(r.loc.city)} · ${esc(r.loc.canton)}`;
    parts.push(`<text x="${padL - 8}" y="${y + 15}" text-anchor="end" font-size="12" font-weight="${r.isYou ? 800 : 600}" fill="${color}">${label}</text>`);
    parts.push(`<rect x="${padL}" y="${y + 3}" width="${w.toFixed(1)}" height="${rowH - 6}" fill="${color}" opacity="${r.isYou ? 1 : 0.82}"><title>${label}: CHF ${fmtChf(r.total)}</title></rect>`);
    parts.push(`<text x="${padL + w + 6}" y="${y + 15}" font-size="11.5" font-weight="700" fill="${color}">${fmtChf(r.total)}</text>`);
  });
  svg.innerHTML = parts.join("");
}

function renderTable(list, base, dict) {
  const thead = document.getElementById("compare-thead");
  const tbody = document.getElementById("compare-tbody");
  const loadMoreWrap = document.getElementById("compare-load-more-wrap");
  const loadMoreBtn = document.getElementById("btn-compare-load-more");

  thead.innerHTML = `
    <tr>
      <th scope="col">${dict.thRank}</th>
      <th scope="col">${dict.thPlace}</th>
      <th scope="col">${dict.thCanton}</th>
      <th scope="col" class="num-col highlight-col">${dict.thTotalTax}</th>
      <th scope="col" class="num-col">${dict.thDiff}</th>
      <th scope="col" class="num-col">${dict.thEffective}</th>
      <th scope="col" class="num-col">${dict.thFed}</th>
      <th scope="col" class="num-col">${dict.thCantonTax}</th>
      <th scope="col" class="num-col">${dict.thCity}</th>
      <th scope="col" class="num-col">${dict.thChurch}</th>
      <th scope="col" class="num-col">${dict.thWealth}</th>
      <th scope="col"></th>
    </tr>
  `;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:2rem;">${dict.emptyRows}</td></tr>`;
    loadMoreWrap.classList.add("hidden");
    return;
  }

  const visible = state.showAllCompareRows ? list : list.slice(0, DEFAULT_LIMIT);
  if (list.length > DEFAULT_LIMIT) {
    loadMoreWrap.classList.remove("hidden");
    loadMoreBtn.textContent = state.showAllCompareRows ? dict.btnShowLessRows(DEFAULT_LIMIT) : dict.btnShowAllRows(list.length, visible.length);
  } else {
    loadMoreWrap.classList.add("hidden");
  }

  tbody.innerHTML = visible.map((r, idx) => {
    const diffCls = r.diff > 0 ? "diff-pos" : r.diff < 0 ? "diff-neg" : "";
    return `
      <tr class="${r.isYou ? "row-you" : ""}">
        <td data-label="${dict.thRank}">${idx + 1}</td>
        <th scope="row">${esc(r.loc.city)}${r.isYou ? `<span class="you-badge">${dict.yourPlaceBadge}</span>` : ""}${r.isCapital ? `<span class="capital-badge">${dict.capitalBadge}</span>` : ""}</th>
        <td data-label="${dict.thCanton}">${esc(r.loc.canton)}</td>
        <td class="num-col highlight-col" data-label="${dict.thTotalTax}">CHF ${fmtChf(r.total)}</td>
        <td class="num-col ${diffCls}" data-label="${dict.thDiff}">${r.diff === null ? "—" : fmtSignedChf(r.diff)}</td>
        <td class="num-col" data-label="${dict.thEffective}">${fmtPct(effectiveRate(r.total, base))}</td>
        <td class="num-col" data-label="${dict.thFed}">${fmtChf(r.incomeTax.fed)}</td>
        <td class="num-col" data-label="${dict.thCantonTax}">${fmtChf(r.incomeTax.canton + (r.wealthTax.canton || 0))}</td>
        <td class="num-col" data-label="${dict.thCity}">${fmtChf(r.incomeTax.city + (r.wealthTax.city || 0))}</td>
        <td class="num-col" data-label="${dict.thChurch}">${fmtChf(r.incomeTax.church + (r.wealthTax.church || 0))}</td>
        <td class="num-col" data-label="${dict.thWealth}">${fmtChf(wealthTaxOf(r))}</td>
        <td class="num-col">${r.isYou ? "" : `<button type="button" class="btn-row-action" data-use-loc="${r.loc.id}" data-bfs="${r.loc.bfsId}" data-city="${esc(r.loc.city)}" data-canton="${esc(r.loc.canton)}">${dict.btnUseLocation}</button>`}</td>
      </tr>
    `;
  }).join("");
}

export function exportCompareToCsv() {
  const dict = I18N[state.lang] || I18N.en;
  const { list } = visiblePlaces();
  if (!list.length) return;
  const base = incomeBase(state.compare.household);
  const lines = [dict.csvHeaders.join(",")];
  list.forEach((r, idx) => {
    const eff = effectiveRate(r.total, base);
    lines.push([
      idx + 1,
      `"${r.loc.city.replace(/"/g, '""')}"`,
      r.loc.canton,
      r.loc.bfsId,
      r.total,
      r.diff === null ? "" : r.diff,
      eff === null ? "" : eff.toFixed(2),
      r.incomeTax.fed,
      r.incomeTax.canton,
      r.incomeTax.city,
      r.incomeTax.church,
      wealthTaxOf(r),
      r.personal
    ].join(","));
  });
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const inc = incomeBase(state.compare.household);
  a.href = url;
  a.download = `swiss-tax-compare-${state.compare.household.year}-${Math.round(inc / 1000)}k-${state.compareScope}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
