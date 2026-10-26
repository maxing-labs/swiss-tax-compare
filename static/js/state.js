import { I18N } from "./i18n/index.js";

const STORAGE_KEY_ACTIVE_STATE = "swiss_tax_compare_active_state_v1";
const TABS = ["overview", "compare", "guide"];
export const DEFAULT_YEAR = 2026;

export const state = {
  lang: "en",
  activeTab: "overview",
  meta: null,
  // household (everything the calculation depends on)
  locationId: 800100000,
  locationName: "8001 Zürich",
  locationBfsId: 261,
  locationCanton: "ZH",
  year: DEFAULT_YEAR,
  status: 1,
  kids: [],
  conf1: 4,
  conf2: 4,
  mode: "gross",
  inc1: 100000,
  type1: 1,
  inc2: 0,
  type2: 1,
  yob1: 1990,
  yob2: 1990,
  taxable: 100000,
  wealth: 0,
  // compare view
  compareScope: "all",
  compareCanton: 26,
  compareQuery: "",
  compareSort: "totalAsc",
  showAllCompareRows: false,
  mobileFiltersCollapsed: false,
  // API results
  calc: null,
  compare: null
};

let saveStateTimer = null;

export function isCouple(status = state.status) {
  return Number(status) === 2 || Number(status) === 4;
}

export function maxYear() {
  return state.meta?.maxYear || DEFAULT_YEAR;
}

export function minYear() {
  return state.meta?.minYear || 2010;
}

// "4, 9" -> [4, 9]; "" -> []; anything else -> null
export function parseKids(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const ages = [];
  for (const p of text.replace(/;/g, ",").split(",").map(s => s.trim()).filter(Boolean)) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 30) return null;
    ages.push(n);
  }
  return ages.slice(0, 10);
}

const URL_KEYS = [
  ["loc", "locationId"], ["name", "locationName"], ["bfs", "locationBfsId"], ["ct", "locationCanton"],
  ["year", "year"], ["status", "status"], ["kids", "kids"], ["conf1", "conf1"], ["conf2", "conf2"], ["mode", "mode"],
  ["inc1", "inc1"], ["type1", "type1"], ["inc2", "inc2"], ["type2", "type2"], ["yob1", "yob1"], ["yob2", "yob2"],
  ["taxable", "taxable"], ["wealth", "wealth"], ["scope", "compareScope"], ["canton", "compareCanton"],
  ["tab", "activeTab"], ["lang", "lang"]
];

export function saveActiveStateToStorageAndUrl() {
  const snapshot = {};
  for (const [, key] of URL_KEYS) snapshot[key] = state[key];
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_STATE, JSON.stringify(snapshot));
  } catch (e) {
    // ignore storage errors
  }
  try {
    const params = new URLSearchParams();
    for (const [param, key] of URL_KEYS) {
      const v = state[key];
      params.set(param, Array.isArray(v) ? v.join(",") : String(v ?? ""));
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString().replace(/%2C/g, ",")}`);
  } catch (e) {
    // ignore history errors
  }
}

// Number inputs fire per keystroke; Safari throttles replaceState (100 calls / 30 s)
export function saveActiveStateDebounced() {
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(saveActiveStateToStorageAndUrl, 500);
}

// Copies the valid fields of `src` (storage snapshot or URL params, keyed by state name) into state
function readSnapshot(src) {
  const num = (k, lo, hi) => {
    if (src[k] === undefined || src[k] === null || src[k] === "") return;
    const v = Number(src[k]);
    if (isNaN(v) || (lo !== undefined && v < lo) || (hi !== undefined && v > hi)) return;
    state[k] = v;
  };
  const oneOf = (k, allowed) => {
    if (src[k] === undefined || src[k] === null || src[k] === "") return;
    const v = typeof allowed[0] === "number" ? Number(src[k]) : src[k];
    if (allowed.includes(v)) state[k] = v;
  };
  num("locationId", 1);
  if (typeof src.locationName === "string" && src.locationName) state.locationName = src.locationName;
  num("locationBfsId", 0);
  if (typeof src.locationCanton === "string") state.locationCanton = src.locationCanton;
  num("year", 1990, 2100);
  oneOf("status", [1, 2, 3, 4]);
  if (Array.isArray(src.kids)) state.kids = src.kids.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 30);
  else if (typeof src.kids === "string") state.kids = parseKids(src.kids) ?? state.kids;
  oneOf("conf1", [1, 2, 3, 4, 5]);
  oneOf("conf2", [1, 2, 3, 4, 5]);
  oneOf("mode", ["gross", "taxable"]);
  num("inc1", 0);
  oneOf("type1", [0, 1, 2, 3, 4]);
  num("inc2", 0);
  oneOf("type2", [0, 1, 2, 3, 4]);
  num("yob1", 1900, 2100);
  num("yob2", 1900, 2100);
  num("taxable", 0);
  num("wealth", 0);
  oneOf("compareScope", ["all", "capitals", "canton"]);
  num("compareCanton", 1, 26);
  oneOf("activeTab", TABS);
  if (src.lang && I18N[src.lang]) state.lang = src.lang;
}

export function loadActiveState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_STATE);
    if (raw) readSnapshot(JSON.parse(raw));
  } catch (e) {
    // ignore
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if ([...params.keys()].length) {
      const src = {};
      for (const [param, key] of URL_KEYS) if (params.has(param)) src[key] = params.get(param);
      readSnapshot(src);
    }
  } catch (e) {
    // ignore
  }
}
