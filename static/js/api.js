// /api endpoints. Non-2xx responses throw; aborting via `signal` rejects with AbortError.

async function getJson(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function fetchMeta() {
  return getJson("/api/meta");
}

export function fetchLocations(query, year, signal) {
  const params = new URLSearchParams({ q: query, year: String(year) });
  return getJson(`/api/locations?${params}`, signal);
}

// Query string shared by every calculation endpoint; identical inputs give an identical URL (CDN cache)
export function householdParams(s) {
  const couple = s.status === 2 || s.status === 4;
  const p = new URLSearchParams();
  p.set("loc", String(s.locationId));
  p.set("year", String(s.year));
  p.set("status", String(s.status));
  p.set("kids", s.kids.join(","));
  p.set("conf1", String(s.conf1));
  if (couple) p.set("conf2", String(s.conf2));
  p.set("mode", s.mode);
  p.set("wealth", String(s.wealth));
  if (s.mode === "gross") {
    p.set("inc1", String(s.inc1));
    p.set("type1", String(s.type1));
    p.set("yob1", String(s.yob1));
    if (couple) {
      p.set("inc2", String(s.inc2));
      p.set("type2", String(s.type2));
      p.set("yob2", String(s.yob2));
    }
  } else {
    p.set("taxable", String(s.taxable));
  }
  return p;
}

export function fetchCalculation(s, signal) {
  return getJson(`/api/calculate?${householdParams(s)}`, signal);
}

export function fetchCompare(s, signal) {
  return getJson(`/api/compare?${householdParams(s)}`, signal);
}

export function fetchCurve(s, signal) {
  return getJson(`/api/curve?${householdParams(s)}`, signal);
}

export function fetchHistory(s, signal) {
  return getJson(`/api/history?${householdParams(s)}`, signal);
}
