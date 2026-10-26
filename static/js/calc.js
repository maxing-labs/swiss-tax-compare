// Pure calculations on API results: no DOM, no app state.

export const LEVELS = ["fed", "canton", "city", "church", "personal"];

// Income + wealth tax per level, the share of the total, and the wealth-tax sum
export function breakdown(result) {
  const inc = result.incomeTax || {};
  const wl = result.wealthTax || {};
  const rows = [
    { level: "fed", income: inc.fed || 0, wealth: 0 },
    { level: "canton", income: inc.canton || 0, wealth: wl.canton || 0 },
    { level: "city", income: inc.city || 0, wealth: wl.city || 0 },
    { level: "church", income: inc.church || 0, wealth: wl.church || 0 },
    { level: "personal", income: result.personal || 0, wealth: 0 }
  ].map(r => ({ ...r, total: r.income + r.wealth }));
  const total = rows.reduce((s, r) => s + r.total, 0);
  for (const r of rows) r.share = total > 0 ? (r.total / total) * 100 : 0;
  return { rows, total, wealthTotal: (wl.canton || 0) + (wl.city || 0) + (wl.church || 0) };
}

export function wealthTaxOf(row) {
  const wl = row.wealthTax || {};
  return (wl.canton || 0) + (wl.city || 0) + (wl.church || 0);
}

// Income the effective rate is measured against: what the user typed in
export function incomeBase(household) {
  if (household.mode === "gross") return (household.inc1 || 0) + (household.inc2 || 0);
  return household.taxable || 0;
}

export function effectiveRate(total, base) {
  if (!base || base <= 0) return null;
  return (total / base) * 100;
}

// Rows with the difference to the user's own municipality (null if it is not in the list), sorted
export function rankPlaces(rows, ownBfsId, sortBy = "totalAsc") {
  const own = rows.find(r => r.loc.bfsId === ownBfsId) || null;
  const list = rows.map(r => ({
    ...r,
    isYou: own !== null && r.loc.bfsId === ownBfsId,
    diff: own ? r.total - own.total : null
  }));
  if (sortBy === "totalDesc") list.sort((a, b) => b.total - a.total || a.loc.city.localeCompare(b.loc.city));
  else if (sortBy === "name") list.sort((a, b) => a.loc.city.localeCompare(b.loc.city) || a.total - b.total);
  else list.sort((a, b) => a.total - b.total || a.loc.city.localeCompare(b.loc.city));
  return { list, own };
}

export function filterPlaces(rows, { scope, cantonId, query }) {
  const q = (query || "").trim().toLowerCase();
  return rows.filter(r => {
    if (scope === "capitals" && !r.isCapital) return false;
    if (scope === "canton" && r.loc.cantonId !== cantonId) return false;
    if (!q) return true;
    return r.loc.city.toLowerCase().includes(q) || r.loc.canton.toLowerCase() === q || r.loc.canton.toLowerCase().includes(q);
  });
}

// Rank (1-based) of the user's place in an ascending-by-total list; ties share the better rank
export function rankOf(sortedAsc, ownBfsId) {
  const idx = sortedAsc.findIndex(r => r.loc.bfsId === ownBfsId);
  if (idx < 0) return null;
  const own = sortedAsc[idx];
  return sortedAsc.findIndex(r => r.total === own.total) + 1;
}

export function median(values) {
  const v = values.filter(x => x !== null && x !== undefined && !isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Curve points with the effective rate; the marginal rate comes from the API (gross: official figure,
// taxable: tax on the next CHF 1'000). Missing marginals are filled from the slope to the next point
export function curveSeries(points) {
  const out = points.map(p => ({ ...p, effective: effectiveRate(p.total, p.income) }));
  for (let i = 0; i < out.length; i++) {
    if (out[i].marginalRate === null || out[i].marginalRate === undefined) {
      const nxt = out[i + 1] || out[i - 1];
      out[i].marginalRate = nxt && nxt.income !== out[i].income
        ? Math.abs((nxt.total - out[i].total) / (nxt.income - out[i].income)) * 100
        : null;
    }
  }
  return out;
}

// Year-over-year change in CHF and percent; null where a year has no data
export function historySeries(points) {
  let prev = null;
  return points.map(p => {
    const row = { ...p, change: null, changePct: null };
    if (p.total !== null && p.total !== undefined && prev !== null) {
      row.change = p.total - prev;
      row.changePct = prev > 0 ? (row.change / prev) * 100 : null;
    }
    if (p.total !== null && p.total !== undefined) prev = p.total;
    return row;
  });
}

// Round axis step (1, 2 or 5 × 10^n) that splits `span` (> 0) into at most `maxTicks` intervals
export function niceStep(span, maxTicks) {
  const raw = span / maxTicks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw - 1e-9);
}
