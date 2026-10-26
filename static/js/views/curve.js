import { I18N } from "../i18n/index.js";
import { fmtChf, fmtPct } from "../format.js";
import { curveSeries, niceStep } from "../calc.js";
import { state } from "../state.js";
import { CHART_THEME, chartWidth } from "./chart-theme.js";

export function renderCurve() {
  const dict = I18N[state.lang] || I18N.en;
  const data = state.curve;
  if (!data?.points) return;
  const pts = curveSeries(data.points);
  const gross = data.household.mode === "gross";

  document.getElementById("curve-chart-title").textContent = dict.curveChartTitle(state.locationName);
  document.getElementById("curve-chart-sub").textContent = gross ? dict.curveChartSubGross : dict.curveChartSubTaxable;
  document.getElementById("curve-legend").innerHTML = `
    <span class="legend-item"><span class="legend-dot" style="background:${CHART_THEME.accent}"></span><span>${dict.legendEffective}</span></span>
    <span class="legend-item"><span class="legend-dot legend-dash"></span><span>${dict.legendMarginal}</span></span>
  `;
  renderChart(pts, data.ownIncome, dict);
  renderTable(pts, data.ownIncome, gross, dict);
}

function renderChart(pts, ownIncome, dict) {
  const svg = document.getElementById("curve-svg");
  const W = chartWidth(svg);
  const H = Math.round(Math.max(260, Math.min(360, W * 0.5)));
  const padL = 44, padR = 16, padT = 26, padB = 34;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxX = Math.max(...pts.map(p => p.income));
  const rates = pts.flatMap(p => [p.effective, p.marginalRate]).filter(v => v !== null);
  const maxY = Math.max(10, Math.ceil(Math.max(...rates) / 10) * 10);
  const scaleX = (v) => padL + (v / maxX) * plotW;
  const scaleY = (v) => padT + plotH - (v / maxY) * plotH;
  const parts = [];

  for (let v = 0; v <= maxY; v += 10) {
    const y = scaleY(v);
    parts.push(`<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${CHART_THEME.grid}" stroke-width="1" />`);
    parts.push(`<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="${CHART_THEME.axisText}">${v}%</text>`);
  }
  const stepX = niceStep(maxX, W < 560 ? 3 : 6);
  for (let v = 0; v <= maxX; v += stepX) {
    const x = scaleX(v);
    parts.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${H - padB}" stroke="${CHART_THEME.grid}" stroke-width="1" />`);
    parts.push(`<text x="${x}" y="${H - padB + 18}" text-anchor="${v === 0 ? "start" : x > W - padR - 30 ? "end" : "middle"}" font-size="12" fill="${CHART_THEME.axisText}">${fmtChf(v)}</text>`);
  }

  const line = (key) => pts.filter(p => p[key] !== null)
    .map(p => `${scaleX(p.income).toFixed(1)},${scaleY(p[key]).toFixed(1)}`).join(" ");
  parts.push(`<polyline fill="none" stroke="${CHART_THEME.ink}" stroke-width="2" stroke-dasharray="6 4" points="${line("marginalRate")}" />`);
  parts.push(`<polyline fill="none" stroke="${CHART_THEME.accent}" stroke-width="2.8" points="${line("effective")}" />`);

  const you = pts.find(p => p.income === ownIncome);
  if (you) {
    const x = scaleX(you.income);
    // Both lines rise to the right: the marginal rate (on top) is labelled above-left of its point, the
    // effective rate below-right; near an edge a label moves to the other side
    const side = (preferLeft) => {
      const left = preferLeft ? x - 70 > padL : x + 70 > W - padR;
      return left ? { lx: x - 8, anchor: "end" } : { lx: x + 8, anchor: "start" };
    };
    const labelX = Math.min(W - padR - 70, Math.max(padL + 70, x));
    parts.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${H - padB}" stroke="${CHART_THEME.cursor}" stroke-width="1.8" />`);
    parts.push(`<text x="${labelX}" y="${padT - 8}" text-anchor="middle" font-size="12" font-weight="700" fill="${CHART_THEME.cursor}">${dict.curveYouLabel(you.income)}</text>`);
    for (const [key, color, dy, preferLeft] of [["effective", CHART_THEME.accent, 20, false], ["marginalRate", CHART_THEME.ink, -9, true]]) {
      if (you[key] === null) continue;
      const y = scaleY(you[key]);
      const { lx, anchor } = side(preferLeft);
      parts.push(`<circle cx="${x}" cy="${y}" r="5" fill="${color}" stroke="${CHART_THEME.pointStroke}" stroke-width="1.5" />`);
      parts.push(`<text x="${lx}" y="${y + dy}" text-anchor="${anchor}" font-size="13" font-weight="800" fill="${color}">${fmtPct(you[key])}</text>`);
    }
  }
  svg.innerHTML = parts.join("");
}

function renderTable(pts, ownIncome, gross, dict) {
  document.getElementById("curve-thead").innerHTML = `
    <tr>
      <th scope="col">${dict.thIncome}</th>
      ${gross ? `<th scope="col" class="num-col">${dict.thTaxableIncome}</th>` : ""}
      <th scope="col" class="num-col highlight-col">${dict.thTotalTax}</th>
      <th scope="col" class="num-col">${dict.thEffective}</th>
      <th scope="col" class="num-col">${dict.thMarginal}</th>
      <th scope="col" class="num-col">${dict.thAfterTax}</th>
    </tr>
  `;
  document.getElementById("curve-tbody").innerHTML = pts.map(p => {
    const isYou = p.income === ownIncome;
    return `
      <tr class="${isYou ? "row-you" : ""}">
        <th scope="row">CHF ${fmtChf(p.income)}${isYou ? `<span class="you-badge">${dict.yourPlaceBadge}</span>` : ""}</th>
        ${gross ? `<td class="num-col" data-label="${dict.thTaxableIncome}">${fmtChf(p.taxableIncomeFed)}</td>` : ""}
        <td class="num-col highlight-col" data-label="${dict.thTotalTax}">${fmtChf(p.total)}</td>
        <td class="num-col" data-label="${dict.thEffective}">${fmtPct(p.effective)}</td>
        <td class="num-col" data-label="${dict.thMarginal}">${fmtPct(p.marginalRate)}</td>
        <td class="num-col" data-label="${dict.thAfterTax}">${fmtChf(p.income - p.total)}</td>
      </tr>
    `;
  }).join("");
}
