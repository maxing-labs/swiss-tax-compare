import { I18N } from "../i18n/index.js";
import { fmtChf, fmtSignedChf, fmtSignedPct } from "../format.js";
import { historySeries, niceStep } from "../calc.js";
import { state } from "../state.js";
import { CHART_THEME, chartWidth } from "./chart-theme.js";

export function renderHistory() {
  const dict = I18N[state.lang] || I18N.en;
  const data = state.history;
  if (!data?.points?.length) return;
  const rows = historySeries(data.points);
  const selectedYear = data.household.year;
  document.getElementById("history-chart-title").textContent =
    dict.historyChartTitle(state.locationName, rows[0].year, rows[rows.length - 1].year);
  renderChart(rows, selectedYear);
  renderTable(rows, selectedYear, dict);
}

function renderChart(rows, selectedYear) {
  const svg = document.getElementById("history-svg");
  const known = rows.filter(r => r.total !== null);
  if (!known.length) {
    svg.innerHTML = "";
    return;
  }
  const W = chartWidth(svg);
  const H = Math.round(Math.max(240, Math.min(300, W * 0.4)));
  const padL = 56, padR = 16, padT = 26, padB = 30;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Not anchored at zero: the year-to-year movement is what matters
  const lo = Math.min(...known.map(r => r.total));
  const hi = Math.max(...known.map(r => r.total));
  const step = niceStep(Math.max(hi - lo, hi * 0.05, 1), 4);
  const minY = Math.max(0, Math.floor(lo / step) * step);
  const maxY = Math.max(minY + step, Math.ceil(hi / step) * step);
  const inset = 16;
  const scaleX = (i) => padL + inset + (rows.length > 1 ? (i / (rows.length - 1)) * (plotW - 2 * inset) : plotW / 2 - inset);
  const scaleY = (v) => padT + plotH - ((v - minY) / (maxY - minY)) * plotH;
  const parts = [];

  for (let v = minY; v <= maxY + step / 2; v += step) {
    const y = scaleY(v);
    parts.push(`<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${CHART_THEME.grid}" stroke-width="1" />`);
    parts.push(`<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="${CHART_THEME.axisText}">${fmtChf(v)}</text>`);
  }
  // every year on a wide chart, every 2nd or 3rd on a phone (a label needs about 38px), counted from the newest
  const labelEvery = Math.max(1, Math.ceil(38 / ((plotW - 2 * inset) / Math.max(1, rows.length - 1))));
  rows.forEach((r, i) => {
    if ((rows.length - 1 - i) % labelEvery) return;
    const x = scaleX(i);
    parts.push(`<text x="${x}" y="${H - padB + 18}" text-anchor="middle" font-size="12" fill="${CHART_THEME.axisText}">${r.year}</text>`);
  });

  // a year without data breaks the line
  const segments = [[]];
  rows.forEach((r, i) => {
    if (r.total === null) segments.push([]);
    else segments[segments.length - 1].push(`${scaleX(i).toFixed(1)},${scaleY(r.total).toFixed(1)}`);
  });
  for (const seg of segments.filter(s => s.length > 1)) {
    parts.push(`<polyline fill="none" stroke="${CHART_THEME.ink}" stroke-width="2.4" points="${seg.join(" ")}" />`);
  }
  rows.forEach((r, i) => {
    if (r.total === null) return;
    const x = scaleX(i);
    const y = scaleY(r.total);
    const isSel = r.year === selectedYear;
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isSel ? 6 : 3.5}" fill="${isSel ? CHART_THEME.accent : CHART_THEME.ink}" stroke="${CHART_THEME.pointStroke}" stroke-width="1.5"><title>${r.year}: CHF ${fmtChf(r.total)}</title></circle>`);
    if (isSel) {
      // label on the side away from the line: below the point if its neighbours are higher on average
      const near = [rows[i - 1], rows[i + 1]].filter(n => n && n.total !== null).map(n => n.total);
      const below = near.length > 0 && near.reduce((a, b) => a + b, 0) / near.length > r.total;
      const anchor = x > W - padR - 50 ? "end" : x < padL + 50 ? "start" : "middle";
      parts.push(`<text x="${x}" y="${below ? y + 24 : y - 12}" text-anchor="${anchor}" font-size="13" font-weight="800" fill="${CHART_THEME.accent}">CHF ${fmtChf(r.total)}</text>`);
    }
  });
  svg.innerHTML = parts.join("");
}

function renderTable(rows, selectedYear, dict) {
  document.getElementById("history-thead").innerHTML = `
    <tr>
      <th scope="col">${dict.thYear}</th>
      <th scope="col" class="num-col highlight-col">${dict.thTotalTax}</th>
      <th scope="col" class="num-col">${dict.thChange}</th>
    </tr>
  `;
  // newest first
  document.getElementById("history-tbody").innerHTML = [...rows].reverse().map(r => {
    const cls = r.change > 0 ? "diff-pos" : r.change < 0 ? "diff-neg" : "";
    const change = r.change === null ? "—" : `${fmtSignedChf(r.change)} (${fmtSignedPct(r.changePct)})`;
    return `
      <tr class="${r.year === selectedYear ? "row-you" : ""}">
        <th scope="row">${r.year}</th>
        <td class="num-col highlight-col" data-label="${dict.thTotalTax}">${r.total === null ? dict.historyNoData : `CHF ${fmtChf(r.total)}`}</td>
        <td class="num-col ${cls}" data-label="${dict.thChange}">${change}</td>
      </tr>
    `;
  }).join("");
}
