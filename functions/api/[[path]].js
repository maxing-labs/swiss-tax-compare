// Cloudflare Pages Function porting api/index.py 1:1 so Swiss Tax Compare runs purely serverless
// on *.pages.dev alongside Vercel (api/index.py) and local dev (server.py), with zero dependencies.

const UPSTREAM =
  "https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export const MIN_YEAR = 2010;
export const MAX_YEAR = 2026;

const STATUS_SINGLE = 1;
const STATUS_MARRIED = 2;
const STATUS_PARTNERSHIP = 4;
const COUPLE_STATUSES = new Set([STATUS_MARRIED, STATUS_PARTNERSHIP]);
const CONFESSIONS = new Set([1, 2, 3, 4, 5]);
const INCOME_TYPES = new Set([0, 1, 2, 3, 4]);
export const LANGUAGE_EN = 4;

export const CANTONS = [
  [1, "AG", 4001, 500000000], [2, "AI", 3101, 905000000], [3, "AR", 3001, 910000000],
  [4, "BE", 351, 301100000], [5, "BL", 2829, 441000000], [6, "BS", 2701, 405100000],
  [7, "FR", 2196, 170000000], [8, "GE", 6621, 120400000], [9, "GL", 1632, 875000000],
  [10, "GR", 3901, 700000000], [11, "JU", 6711, 280000000], [12, "LU", 1061, 600300000],
  [13, "NE", 6458, 200000000], [14, "NW", 1509, 637000000], [15, "OW", 1407, 606000000],
  [16, "SG", 3203, 900000000], [17, "SH", 2939, 820000000], [18, "SO", 2601, 450000000],
  [19, "SZ", 1372, 643000000], [20, "TG", 4566, 850000000], [21, "TI", 5002, 650000000],
  [22, "UR", 1201, 646000000], [23, "VD", 5586, 100300000], [24, "VS", 6266, 195000000],
  [25, "ZG", 1711, 630000000], [26, "ZH", 261, 800100000],
];
const CAPITAL_BFS_IDS = new Set(CANTONS.map(([, , bfs]) => bfs));
const VALID_CANTON_IDS = new Set(CANTONS.map(([cid]) => cid));

const PILLAR_3A_CAPS = {
  2023: [7056, 35280],
  2024: [7056, 35280],
  2025: [7258, 36288],
  2026: [7258, 36288],
};
export const BUDGET_3A = "PRAEMIEN3A";
export const BUDGET_OTHER_DEDUCTIONS = "UEBRIGEABZUEGE";

const CURVE_INCOMES = [
  20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000,
  120000, 140000, 160000, 180000, 200000, 250000, 300000, 400000, 500000,
];

const CACHE_SECONDS = { "/api/locations": 86400, "/api/meta": 86400 };
const STATUS_PHRASES = {
  400: "Bad Request",
  404: "Not Found",
  500: "Internal Server Error",
  502: "Bad Gateway",
  504: "Gateway Timeout",
};

export class EmptyResultError extends Error {
  constructor(message) {
    super(message);
    this.name = "EmptyResultError";
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "BadRequestError";
  }
}

export class UpstreamNetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = "UpstreamNetworkError";
  }
}

export class UpstreamTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

// Match Python round-half-to-even for exact parity
function pyRound(value, ndigits = 0) {
  const factor = 10 ** ndigits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const eps = 1e-12;
  let rounded;
  if (Math.abs(diff - 0.5) < eps) {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(scaled);
  }
  return ndigits === 0 ? rounded : Number((rounded / factor).toFixed(ndigits));
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let nextIdx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIdx < items.length) {
      const i = nextIdx++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function defaultPostUpstream(operation, payload) {
  let resp;
  try {
    resp = await fetch(`${UPSTREAM}/${operation}`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      throw new UpstreamTimeoutError(e.message || "timed out");
    }
    throw new UpstreamNetworkError(e?.message || String(e));
  }
  if (!resp.ok) {
    throw new UpstreamNetworkError(`Upstream HTTP ${resp.status} for ${operation}`);
  }
  let body;
  try {
    body = await resp.json();
  } catch (e) {
    throw new UpstreamNetworkError(`Invalid JSON from ${operation}: ${e?.message || e}`);
  }
  return body ? body.response : undefined;
}

export function parseQs(searchParams) {
  const qs = {};
  for (const [k, v] of searchParams.entries()) {
    if (v === "") continue;
    if (!qs[k]) qs[k] = [];
    qs[k].push(v);
  }
  return qs;
}

function first(qs, key, fallback = null) {
  return qs[key] && qs[key].length > 0 ? qs[key][0] : fallback;
}

function parseIntParam(qs, key, defaultVal, lo = null, hi = null) {
  const raw = first(qs, key, null);
  if (raw === null || raw === "") return defaultVal;
  const trimmed = raw.trim();
  const num = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(num)) {
    throw new BadRequestError(`${key} must be a number`);
  }
  const val = Math.trunc(num);
  if ((lo !== null && val < lo) || (hi !== null && val > hi)) {
    throw new BadRequestError(`${key} out of range`);
  }
  return val;
}

function parseChoice(qs, key, defaultVal, allowedSet) {
  const val = parseIntParam(qs, key, defaultVal);
  if (!allowedSet.has(val)) {
    throw new BadRequestError(`${key} must be one of [${[...allowedSet].sort((a, b) => a - b).join(", ")}]`);
  }
  return val;
}

export function parseKids(raw) {
  const ages = [];
  for (const rawPart of (raw || "").replaceAll(";", ",").split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    const num = Number(part);
    if (!Number.isFinite(num)) {
      throw new BadRequestError("kids must be a comma-separated list of ages");
    }
    const age = Math.trunc(num);
    ages.push(Math.max(0, Math.min(30, age)));
  }
  return ages.slice(0, 10);
}

export function parseCantons(raw) {
  if (!raw || !raw.trim()) return CANTONS;
  const wanted = new Set();
  for (const rawPart of raw.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    if (!/^-?\d+$/.test(part)) {
      throw new BadRequestError("cantons must be a comma-separated list of canton ids");
    }
    const cid = Number(part);
    if (!VALID_CANTON_IDS.has(cid)) {
      throw new BadRequestError(`unknown canton id: ${cid}`);
    }
    wanted.add(cid);
  }
  if (wanted.size === 0) {
    throw new BadRequestError("cantons must not be empty");
  }
  return CANTONS.filter(([cid]) => wanted.has(cid));
}

export function parseHousehold(qs) {
  const year = parseIntParam(qs, "year", MAX_YEAR, MIN_YEAR, MAX_YEAR);
  const status = parseChoice(qs, "status", STATUS_SINGLE, new Set([1, 2, 3, 4]));
  const couple = COUPLE_STATUSES.has(status);
  const mode = first(qs, "mode", "gross");
  if (mode !== "gross" && mode !== "taxable") {
    throw new BadRequestError("mode must be gross or taxable");
  }
  const h = {
    loc: parseIntParam(qs, "loc", 800100000, 1),
    year,
    status,
    couple,
    kids: parseKids(first(qs, "kids", "")),
    conf1: parseChoice(qs, "conf1", 4, CONFESSIONS),
    conf2: couple ? parseChoice(qs, "conf2", 4, CONFESSIONS) : 0,
    mode,
    wealth: parseIntParam(qs, "wealth", 0, 0, 1_000_000_000),
    inc1: parseIntParam(qs, "inc1", 100000, 0, 100_000_000),
    type1: parseChoice(qs, "type1", 1, INCOME_TYPES),
    inc2: couple ? parseIntParam(qs, "inc2", 0, 0, 100_000_000) : 0,
    type2: couple ? parseChoice(qs, "type2", 1, INCOME_TYPES) : 0,
    taxable: parseIntParam(qs, "taxable", 100000, 0, 100_000_000),
    yob1: parseIntParam(qs, "yob1", 1990, 1900, year),
    yob2: couple ? parseIntParam(qs, "yob2", 1990, 1900, year) : 0,
  };
  h.age1 = year - h.yob1;
  h.age2 = couple ? year - h.yob2 : 0;
  if (h.type1 === 0) h.inc1 = 0;
  if (h.type2 === 0) h.inc2 = 0;
  return h;
}

function commonPayload(h) {
  return {
    SimKey: null,
    TaxYear: h.year,
    Relationship: h.status,
    Confession1: h.conf1,
    Confession2: h.couple ? h.conf2 : 0,
    Children: h.kids.map((a) => ({ Age: a })),
  };
}

export function simplePayload(h, locId, taxable = null) {
  const t = taxable === null ? h.taxable : taxable;
  return {
    ...commonPayload(h),
    TaxLocationID: locId,
    TaxableIncomeCanton: t,
    TaxableIncomeFed: t,
    TaxableFortune: h.wealth,
  };
}

function grossFields(h, inc1 = null, inc2 = null) {
  const r1 = inc1 === null ? h.inc1 : inc1;
  const r2 = inc2 === null ? h.inc2 : inc2;
  const f = {
    Age1: h.age1,
    RevenueType1: h.type1,
    Revenue1: h.type1 ? r1 : 0,
    Fortune: h.wealth,
  };
  if (h.couple) {
    f.Age2 = h.age2;
    f.RevenueType2 = h.type2;
    f.Revenue2 = h.type2 ? r2 : 0;
  } else {
    f.Age2 = 0;
    f.RevenueType2 = 0;
    f.Revenue2 = 0;
  }
  return f;
}

export function detailedPayload(h, locId, inc1 = null, inc2 = null) {
  return {
    ...commonPayload(h),
    ...grossFields(h, inc1, inc2),
    TaxLocationID: locId,
    Language: LANGUAGE_EN,
    Budget: [],
  };
}

export function pillar3aCaps(year) {
  const known = Object.keys(PILLAR_3A_CAPS).map(Number).sort((a, b) => a - b);
  const le = known.filter((y) => y <= year);
  const chosen = le.length > 0 ? le[le.length - 1] : known[0];
  const [withPension, selfEmployed] = PILLAR_3A_CAPS[chosen];
  return { withPension, selfEmployed };
}

export function manyPayload(h, groupId) {
  return {
    ...commonPayload(h),
    ...grossFields(h),
    TaxGroupID: groupId,
  };
}

function normLoc(raw) {
  const r = raw || {};
  return {
    id: r.TaxLocationID ?? null,
    zip: r.ZipCode || "",
    city: r.City || r.BfsName || "",
    canton: r.Canton || "",
    cantonId: r.CantonID ?? null,
    bfsId: r.BfsID ?? null,
    bfsName: r.BfsName || "",
  };
}

export function normalizeRow(r) {
  if (!r || typeof r !== "object" || !("TotalTax" in r)) {
    throw new EmptyResultError("upstream result has no TotalTax");
  }
  const g = (k) => r[k] || 0;
  return {
    loc: normLoc(r.Location),
    incomeTax: {
      fed: g("IncomeTaxFed"),
      canton: g("IncomeTaxCanton"),
      city: g("IncomeTaxCity"),
      church: g("IncomeTaxChurch"),
    },
    wealthTax: {
      canton: g("FortuneTaxCanton"),
      city: g("FortuneTaxCity"),
      church: g("FortuneTaxChurch"),
    },
    personal: g("PersonalTax"),
    credit: g("TaxCredit"),
    total: g("TotalTax"),
    net: g("TotalNetTax"),
  };
}

function normPerson(raw) {
  const r = raw || {};
  const g = (k) => r[k] || 0;
  return {
    gross: g("GrossIncome"),
    ahv: g("AIOContribution"),
    alv: g("ALVContribution"),
    nbu: g("NBUContribution"),
    bvg: g("BVGContribution"),
    net: g("NetIncome"),
  };
}

function normDeductions(items) {
  const out = [];
  for (const it of items || []) {
    const entry = it.Entry || {};
    const group = it.Group || {};
    out.push({
      id: entry.ID ?? null,
      group: { de: group.DE ?? null, fr: group.FR ?? null, it: group.IT ?? null, en: group.EN ?? null },
      label: { de: entry.DE ?? null, fr: entry.FR ?? null, it: entry.IT ?? null, en: entry.EN ?? null },
      value: it.Value || 0,
    });
  }
  return out;
}

export function normalizeDetailed(r) {
  const row = normalizeRow(r);
  const g = (k) => r[k] || 0;
  return {
    ...row,
    taxableIncomeFed: g("TaxableIncomeFed"),
    taxableIncomeCanton: g("TaxableIncomeCanton"),
    taxableWealth: g("TaxableFortuneCanton"),
    marginalRate: r.MarginalTaxRate ?? null,
    taxFreedomDay: r.TaxFreedomDay ?? null,
    p1: normPerson(r.IncomeP1),
    p2: normPerson(r.IncomeP2),
    deductions: {
      fed: normDeductions(r.InfoFed),
      canton: normDeductions(r.InfoCanton),
    },
  };
}

export function normalizeSimple(r, h, taxable = null) {
  const row = normalizeRow(r);
  const t = taxable === null ? h.taxable : taxable;
  return {
    ...row,
    taxableIncomeFed: t,
    taxableIncomeCanton: t,
    taxableWealth: h.wealth,
    marginalRate: null,
  };
}

function householdIncome(h) {
  return h.mode === "gross" ? h.inc1 + h.inc2 : h.taxable;
}

export function splitIncome(h, total) {
  const base = h.inc1 + h.inc2;
  if (!h.couple || h.type2 === 0 || base <= 0) return [total, 0];
  const inc1 = pyRound((total * h.inc1) / base);
  return [inc1, total - inc1];
}

export async function calcOne(h, postUpstream = defaultPostUpstream, locId = null, income = null) {
  const targetLoc = locId === null ? h.loc : locId;
  if (h.mode === "gross") {
    const total = income === null ? householdIncome(h) : income;
    const [inc1, inc2] = splitIncome(h, total);
    const raw = await postUpstream("API_calculateDetailedTaxes", detailedPayload(h, targetLoc, inc1, inc2));
    return normalizeDetailed(raw);
  }
  const taxable = income === null ? h.taxable : income;
  const [rawBase, rawNext] = await Promise.all([
    postUpstream("API_calculateSimpleTaxes", simplePayload(h, targetLoc, taxable)),
    postUpstream("API_calculateSimpleTaxes", simplePayload(h, targetLoc, taxable + 1000)),
  ]);
  const row = normalizeSimple(rawBase, h, taxable);
  const nxt = normalizeRow(rawNext);
  row.marginalRate = pyRound((nxt.total - row.total) / 10, 1);
  return row;
}

function compareRow(r) {
  const row = normalizeRow(r);
  const loc = row.loc;
  return {
    loc: { id: loc.id, city: loc.city, canton: loc.canton, cantonId: loc.cantonId, bfsId: loc.bfsId },
    incomeTax: row.incomeTax,
    wealthTax: row.wealthTax,
    personal: row.personal,
    total: row.total,
    isCapital: CAPITAL_BFS_IDS.has(loc.bfsId),
  };
}

async function calcCompare(h, postUpstream) {
  if (h.mode === "gross") {
    const results = await mapConcurrent(CANTONS, 26, (c) =>
      postUpstream("API_calculateManySimpleTaxes", manyPayload(h, c[0])),
    );
    const rows = results.flatMap((res) => (res || []).map(compareRow));
    if (rows.length === 0) throw new EmptyResultError("no municipalities from upstream");
    return { scope: "municipalities", rows };
  }
  const results = await mapConcurrent(CANTONS, 26, (c) =>
    postUpstream("API_calculateSimpleTaxes", simplePayload(h, c[3])),
  );
  return { scope: "capitals", rows: results.map(compareRow) };
}

function budgetWith(budget, amounts) {
  return budget.map((it) => (it.Ident in amounts ? { ...it, Value: amounts[it.Ident] } : it));
}

function savingsTiers(totals, amounts) {
  return totals.map((total, i) => {
    const ded = amounts[i];
    const step = i ? ded - amounts[i - 1] : 0;
    const stepSaved = i ? totals[i - 1] - total : 0;
    return {
      deduction: ded,
      total,
      saved: totals[0] - total,
      perFranc: step ? pyRound(stepSaved / step, 4) : null,
    };
  });
}

async function calcSavingsAt(h, locId, p3a, bvg, budget, postUpstream) {
  const amounts = [0, p3a, p3a + bvg];
  let budgets;
  let run;
  if (h.mode === "gross") {
    budgets = [
      [],
      budgetWith(budget, { [BUDGET_3A]: p3a }),
      budgetWith(budget, { [BUDGET_3A]: p3a, [BUDGET_OTHER_DEDUCTIONS]: bvg }),
    ];
    run = async (b) => {
      const p = detailedPayload(h, locId);
      p.Budget = b;
      return normalizeDetailed(await postUpstream("API_calculateDetailedTaxes", p));
    };
  } else {
    budgets = amounts;
    run = async (ded) => {
      const taxable = Math.max(0, h.taxable - ded);
      return normalizeSimple(
        await postUpstream("API_calculateSimpleTaxes", simplePayload(h, locId, taxable)),
        h,
        taxable,
      );
    };
  }
  const rows = [];
  for (let i = 0; i < budgets.length; i++) {
    rows.push(i > 0 && amounts[i] === amounts[i - 1] ? rows[rows.length - 1] : await run(budgets[i]));
  }
  return {
    loc: rows[0].loc,
    tiers: savingsTiers(
      rows.map((r) => r.total),
      amounts,
    ),
    taxableIncomeFed: rows.map((r) => r.taxableIncomeFed),
  };
}

async function fetchBudget(h, locId, postUpstream) {
  const p = detailedPayload(h, locId);
  delete p.Budget;
  const budget = await postUpstream("API_calculateTaxBudget", p);
  if (!Array.isArray(budget) || !budget.some((it) => it && it.Ident === BUDGET_3A)) {
    throw new EmptyResultError("upstream budget list has no pillar 3a item");
  }
  return budget;
}

async function calcSavings(h, p3a, bvg, capitals, cantons, postUpstream) {
  const budget = h.mode === "gross" ? await fetchBudget(h, h.loc, postUpstream) : null;
  const out = {
    pillar3a: p3a,
    bvg,
    caps: pillar3aCaps(h.year),
    method: h.mode === "gross" ? "budget" : "taxable",
  };
  if (!capitals) {
    return { ...out, ...(await calcSavingsAt(h, h.loc, p3a, bvg, budget, postUpstream)) };
  }
  const targets = cantons || CANTONS;
  // Concurrency 4 per batch (2 batches in parallel = 8 total concurrent calls to ESTV)
  const results = await mapConcurrent(targets, 4, (c) =>
    calcSavingsAt(h, c[3], p3a, bvg, budget, postUpstream),
  );
  const rows = results.map((r) => ({
    loc: {
      id: r.loc.id,
      city: r.loc.city,
      canton: r.loc.canton,
      cantonId: r.loc.cantonId,
      bfsId: r.loc.bfsId,
    },
    tiers: r.tiers,
  }));
  return { ...out, rows };
}

async function calcCurve(h, postUpstream) {
  const incomes = [...CURVE_INCOMES];
  const own = householdIncome(h);
  if (own > 0 && !incomes.includes(own)) incomes.push(own);
  incomes.sort((a, b) => a - b);
  const rows = await mapConcurrent(incomes, 10, (inc) => calcOne(h, postUpstream, null, inc));
  const points = incomes.map((inc, idx) => {
    const row = rows[idx];
    return {
      income: inc,
      total: row.total,
      marginalRate: row.marginalRate,
      taxableIncomeFed: row.taxableIncomeFed,
      incomeTax: row.incomeTax,
      wealthTax: row.wealthTax,
      personal: row.personal,
    };
  });
  return { points, ownIncome: own };
}

async function calcHistory(h, postUpstream) {
  const years = [];
  for (let y = MIN_YEAR; y <= MAX_YEAR; y++) years.push(y);
  const rows = await mapConcurrent(years, 10, async (year) => {
    const hy = { ...h, year, age1: year - h.yob1, age2: h.couple ? year - h.yob2 : 0 };
    try {
      return await calcOne(hy, postUpstream);
    } catch (e) {
      console.warn(`history ${year} failed: ${e?.message || e}`);
      return null;
    }
  });
  if (!rows.some(Boolean)) throw new EmptyResultError("no history from upstream");
  const points = years.map((year, idx) => {
    const row = rows[idx];
    if (!row) return { year, total: null };
    return {
      year,
      total: row.total,
      incomeTax: row.incomeTax,
      wealthTax: row.wealthTax,
      personal: row.personal,
      taxableIncomeFed: row.taxableIncomeFed,
      marginalRate: row.marginalRate,
    };
  });
  return { points };
}

async function searchLocations(query, year, postUpstream) {
  const q = (query || "").trim();
  if (q.length < 2) return [];
  const res = await postUpstream("API_searchLocation", {
    Search: q,
    Language: LANGUAGE_EN,
    TaxYear: year,
  });
  return (res || []).map(normLoc).slice(0, 40);
}

export function meta() {
  const caps = {};
  for (let y = MIN_YEAR; y <= MAX_YEAR; y++) caps[String(y)] = pillar3aCaps(y);
  return {
    minYear: MIN_YEAR,
    maxYear: MAX_YEAR,
    pillar3aCaps: caps,
    cantons: CANTONS.map(([id, abbr, bfs, loc]) => ({
      id,
      abbr,
      capitalBfsId: bfs,
      capitalLocId: loc,
    })),
    source: "https://swisstaxcalculator.estv.admin.ch",
  };
}

export async function handleApiRequest(path, qs, postUpstream = defaultPostUpstream) {
  if (path === "/api/meta") return meta();
  if (path === "/api/locations") {
    const year = parseIntParam(qs, "year", MAX_YEAR, MIN_YEAR, MAX_YEAR);
    return { locations: await searchLocations(first(qs, "q", ""), year, postUpstream) };
  }
  if (path === "/api/calculate") {
    const h = parseHousehold(qs);
    return { household: h, result: await calcOne(h, postUpstream) };
  }
  if (path === "/api/compare") {
    const h = parseHousehold(qs);
    return { ...(await calcCompare(h, postUpstream)), household: h };
  }
  if (path === "/api/curve") {
    const h = parseHousehold(qs);
    return { ...(await calcCurve(h, postUpstream)), household: h };
  }
  if (path === "/api/history") {
    const h = parseHousehold(qs);
    return { ...(await calcHistory(h, postUpstream)), household: h };
  }
  if (path === "/api/savings") {
    const h = parseHousehold(qs);
    const caps = pillar3aCaps(h.year);
    const p3a = parseIntParam(qs, "pillar3a", caps.withPension, 0, 1_000_000);
    const bvg = parseIntParam(qs, "bvg", 0, 0, 100_000_000);
    const capitals = first(qs, "scope", "place") === "capitals";
    const cantons = capitals ? parseCantons(first(qs, "cantons", "")) : null;
    return { ...(await calcSavings(h, p3a, bvg, capitals, cantons, postUpstream)), household: h };
  }
  throw new NotFoundError(`Unknown API endpoint: ${path}`);
}

export function errorStatus(e) {
  if (e instanceof NotFoundError) return 404;
  if (e instanceof BadRequestError) return 400;
  if (e instanceof UpstreamTimeoutError || e?.name === "TimeoutError" || e?.name === "AbortError") {
    return 504;
  }
  if (e instanceof EmptyResultError || e instanceof UpstreamNetworkError) {
    return 502;
  }
  return 500;
}

export async function handleRequest(request, { postUpstream = defaultPostUpstream, waitUntil = null } = {}) {
  const url = new URL(request.url);
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const qs = parseQs(url.searchParams);
  try {
    const data = await handleApiRequest(url.pathname, qs, postUpstream);
    const ttl = CACHE_SECONDS[url.pathname] ?? 3600;
    const response = new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=60, s-maxage=${ttl}, stale-while-revalidate`,
        "Access-Control-Allow-Origin": "*",
      },
    });
    if (cache) {
      const store = cache.put(cacheKey, response.clone());
      if (waitUntil) waitUntil(store);
      else await store;
    }
    return response;
  } catch (e) {
    const status = errorStatus(e);
    console.warn(`GET ${url.pathname}${url.search} -> ${status}: ${e?.message || e}`);
    return new Response(JSON.stringify({ error: STATUS_PHRASES[status] }), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }
}

export function onRequestGet(context) {
  return handleRequest(context.request, { waitUntil: (p) => context.waitUntil(p) });
}
