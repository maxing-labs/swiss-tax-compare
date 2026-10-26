import { I18N } from "../i18n/index.js";
import { fmtChf, fmtPct, esc } from "../format.js";
import { breakdown, incomeBase, effectiveRate } from "../calc.js";
import { state, isCouple } from "../state.js";
import { LEVEL_COLORS } from "./chart-theme.js";

const LEVEL_LABEL_KEYS = { fed: "lvlFed", canton: "lvlCanton", city: "lvlCity", church: "lvlChurch", personal: "lvlPersonal" };
const LEGEND_KEYS = { fed: "legendFed", canton: "legendCanton", city: "legendCity", church: "legendChurch", personal: "legendPersonal" };
const DEDUCTION_LANG = { en: "en", de: "de", zh: "en" };

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

export function renderOverview() {
  const dict = I18N[state.lang] || I18N.en;
  const data = state.calc;
  if (!data?.result) return;
  const r = data.result;
  const h = data.household;
  const base = incomeBase(h);
  const eff = effectiveRate(r.total, base);

  setText("kpi-total", `CHF ${fmtChf(r.total)}`);
  setText("kpi-total-sub", dict.kpiTotalSub(`${state.locationName} · ${state.locationCanton}`, h.year));
  setText("kpi-effective", fmtPct(eff));
  setText("kpi-effective-sub", h.mode === "gross" ? dict.kpiEffectiveSubGross(base) : dict.kpiEffectiveSubTaxable(base));
  setText("kpi-marginal", fmtPct(r.marginalRate));
  setText("kpi-monthly", `CHF ${fmtChf(r.total / 12)}`);

  renderBreakdown(r, h, dict);
  renderWaterfall(r, h, dict);
}

function renderBreakdown(r, h, dict) {
  const { rows, total, wealthTotal } = breakdown(r);
  const bar = document.getElementById("breakdown-bar");
  bar.innerHTML = rows.filter(x => x.total > 0).map(x =>
    `<div class="breakdown-seg" data-share="${x.share.toFixed(1)}" style="width:${x.share}%;background:${LEVEL_COLORS[x.level]}" title="${dict[LEGEND_KEYS[x.level]]}: CHF ${fmtChf(x.total)} (${fmtPct(x.share)})"></div>`
  ).join("");

  document.getElementById("breakdown-legend").innerHTML = rows.filter(x => x.total > 0).map(x => `
    <span class="legend-item">
      <span class="legend-swatch" style="background:${LEVEL_COLORS[x.level]}"></span>
      <span>${dict[LEGEND_KEYS[x.level]]} ${fmtPct(x.share, 0)}</span>
    </span>
  `).join("");

  document.getElementById("breakdown-thead").innerHTML = `
    <tr>
      <th scope="col">${dict.thLevel}</th>
      <th scope="col" class="num-col">${dict.thOnIncome}</th>
      <th scope="col" class="num-col">${dict.thOnWealth}</th>
      <th scope="col" class="num-col highlight-col">${dict.thAmount}</th>
      <th scope="col" class="num-col">${dict.thShare}</th>
    </tr>
  `;
  const body = rows.map(x => `
    <tr>
      <th scope="row"><span class="legend-swatch" style="display:inline-block;vertical-align:-1px;margin-inline-end:0.4rem;background:${LEVEL_COLORS[x.level]}"></span>${dict[LEVEL_LABEL_KEYS[x.level]]}</th>
      <td class="num-col" data-label="${dict.thOnIncome}">${x.level === "personal" ? "—" : fmtChf(x.income)}</td>
      <td class="num-col" data-label="${dict.thOnWealth}">${x.level === "fed" || x.level === "personal" ? "—" : fmtChf(x.wealth)}</td>
      <td class="num-col highlight-col" data-label="${dict.thAmount}">${x.level === "personal" ? fmtChf(x.total) : fmtChf(x.total)}</td>
      <td class="num-col" data-label="${dict.thShare}">${fmtPct(x.share)}</td>
    </tr>
  `);
  body.push(`
    <tr class="row-total">
      <th scope="row">${dict.lvlTotal}</th>
      <td class="num-col" data-label="${dict.thOnIncome}">${fmtChf(total - wealthTotal - (r.personal || 0))}</td>
      <td class="num-col" data-label="${dict.thOnWealth}">${fmtChf(wealthTotal)}</td>
      <td class="num-col highlight-col" data-label="${dict.thAmount}">CHF ${fmtChf(total)}</td>
      <td class="num-col" data-label="${dict.thShare}">100%</td>
    </tr>
  `);
  document.getElementById("breakdown-tbody").innerHTML = body.join("");
  setText("wealth-note", h.wealth > 0 ? dict.wealthNote(h.wealth) : "");
}

function renderWaterfall(r, h, dict) {
  const tbody = document.getElementById("waterfall-tbody");
  const details = document.getElementById("deductions-details");
  const title = document.getElementById("waterfall-title");
  const hint = document.getElementById("waterfall-hint");

  if (h.mode !== "gross") {
    title.textContent = dict.secWaterfallTaxable;
    hint.textContent = dict.taxableModeNote;
    tbody.innerHTML = `
      <tr class="wf-key"><th scope="row">${dict.wfTaxableFed}</th><td class="num-col">${fmtChf(r.taxableIncomeFed)}</td></tr>
      <tr class="wf-key"><th scope="row">${dict.wfTaxableCanton}</th><td class="num-col">${fmtChf(r.taxableIncomeCanton)}</td></tr>
      <tr><th scope="row">${dict.wfTax}</th><td class="num-col text-neg">−${fmtChf(r.total)}</td></tr>
      <tr class="wf-final"><th scope="row">${dict.wfAfterTaxTaxable}</th><td class="num-col">CHF ${fmtChf(r.taxableIncomeFed - r.total)}</td></tr>
    `;
    details.classList.add("hidden");
    return;
  }

  title.textContent = dict.secWaterfall;
  hint.textContent = dict.waterfallHint;
  const p1 = r.p1 || {};
  const p2 = isCouple(h.status) ? (r.p2 || {}) : {};
  const sum = (k) => (p1[k] || 0) + (p2[k] || 0);
  const gross = sum("gross");
  const net = sum("net");
  const otherDeductions = net - r.taxableIncomeFed;
  const rows = [
    ["wf-key", dict.wfGross, gross, false],
    ["wf-sub", dict.wfAhv, -sum("ahv"), true],
    ["wf-sub", dict.wfAlv, -sum("alv"), true],
    ["wf-sub", dict.wfNbu, -sum("nbu"), true],
    ["wf-sub", dict.wfBvg, -sum("bvg"), true],
    ["wf-key", dict.wfNet, net, false],
    ["wf-sub", dict.wfDeductions, -otherDeductions, true],
    ["wf-key", dict.wfTaxableFed, r.taxableIncomeFed, false],
    ["wf-sub", dict.wfTaxableCanton, r.taxableIncomeCanton, false],
    ["", dict.wfTax, -r.total, true],
    ["wf-final", dict.wfTakeHome, net - r.total, false]
  ];
  tbody.innerHTML = rows.map(([cls, label, val, neg]) => `
    <tr class="${cls}">
      <th scope="row">${label}</th>
      <td class="num-col ${neg && val < 0 ? "text-neg" : ""}">${cls === "wf-final" ? "CHF " : ""}${val < 0 ? "−" : ""}${fmtChf(Math.abs(val))}</td>
    </tr>
  `).join("");

  const lang = DEDUCTION_LANG[state.lang] || "en";
  const fed = r.deductions?.fed || [];
  const canton = r.deductions?.canton || [];
  const byId = new Map();
  for (const d of fed) byId.set(d.id, { group: d.group, label: d.label, fed: d.value, canton: null });
  for (const d of canton) {
    const row = byId.get(d.id);
    if (row) row.canton = d.value;
    else byId.set(d.id, { group: d.group, label: d.label, fed: null, canton: d.value });
  }
  details.classList.toggle("hidden", byId.size === 0);
  document.getElementById("deductions-thead").innerHTML = `
    <tr><th scope="col">${dict.thDeduction}</th><th scope="col" class="num-col">${dict.thFedCol}</th><th scope="col" class="num-col">${dict.thCantonCol}</th></tr>
  `;
  document.getElementById("deductions-tbody").innerHTML = [...byId.values()].map(d => `
    <tr>
      <th scope="row"><div class="dd-group">${esc(d.group?.[lang] || d.group?.en || "")}</div>${esc(d.label?.[lang] || d.label?.en || d.id)}</th>
      <td class="num-col ${d.fed < 0 ? "text-neg" : ""}">${d.fed === null ? "—" : fmtChf(d.fed)}</td>
      <td class="num-col ${d.canton < 0 ? "text-neg" : ""}">${d.canton === null ? "—" : fmtChf(d.canton)}</td>
    </tr>
  `).join("");
}
