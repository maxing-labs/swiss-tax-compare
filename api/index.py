"""Swiss Tax Compare backend: a thin proxy over the Federal Tax Administration's (ESTV / FTA)
tax calculator API (swisstaxcalculator.estv.admin.ch), which has no CORS headers.

Every endpoint is a GET with query parameters so the CDN can cache it. Upstream is asked
with its JSON operations (API_calculateDetailedTaxes etc.); results are trimmed to what the
frontend needs. Standard library only.
"""
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

UPSTREAM = "https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

# Upstream has data for these tax years (API_getTaxYearRangeCanton, checked 2026-10). Update yearly.
MIN_YEAR = 2010
MAX_YEAR = 2026

# Upstream enums (from the official frontend bundle)
STATUS_SINGLE, STATUS_MARRIED, STATUS_CONCUBINAGE, STATUS_PARTNERSHIP = 1, 2, 3, 4
COUPLE_STATUSES = (STATUS_MARRIED, STATUS_PARTNERSHIP)
CONFESSIONS = (1, 2, 3, 4, 5)  # reformed, roman catholic, christ catholic, none, other
INCOME_TYPES = (0, 1, 2, 3, 4)  # none, employed (gross), self-employed (net), pensioner, other
LANGUAGE_EN = 4

# Alphabetical canton ids as used by upstream (CantonID), with the capital's municipality (BfsID)
# and the capital's TaxLocationID (used when only single-location calls are possible)
CANTONS = [
    (1, "AG", 4001, 500000000), (2, "AI", 3101, 905000000), (3, "AR", 3001, 910000000),
    (4, "BE", 351, 301100000), (5, "BL", 2829, 441000000), (6, "BS", 2701, 405100000),
    (7, "FR", 2196, 170000000), (8, "GE", 6621, 120400000), (9, "GL", 1632, 875000000),
    (10, "GR", 3901, 700000000), (11, "JU", 6711, 280000000), (12, "LU", 1061, 600300000),
    (13, "NE", 6458, 200000000), (14, "NW", 1509, 637000000), (15, "OW", 1407, 606000000),
    (16, "SG", 3203, 900000000), (17, "SH", 2939, 820000000), (18, "SO", 2601, 450000000),
    (19, "SZ", 1372, 643000000), (20, "TG", 4566, 850000000), (21, "TI", 5002, 650000000),
    (22, "UR", 1201, 646000000), (23, "VD", 5586, 100300000), (24, "VS", 6266, 195000000),
    (25, "ZG", 1711, 630000000), (26, "ZH", 261, 800100000),
]
CAPITAL_BFS_IDS = {bfs for _, _, bfs, _ in CANTONS}

# Household incomes (CHF) at which the income curve is sampled
CURVE_INCOMES = [20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000,
                 120000, 140000, 160000, 180000, 200000, 250000, 300000, 400000, 500000]


class EmptyResultError(Exception):
    """Upstream answered without a usable result; served as 502 without cache headers."""


class NotFoundError(Exception):
    """Unknown /api/* path; served as 404 without cache headers."""


class BadRequestError(Exception):
    """Invalid query parameter; served as 400 without cache headers."""


def post_upstream(operation: str, payload: dict):
    req = urllib.request.Request(
        f"{UPSTREAM}/{operation}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return body.get("response")


# --- query parsing --------------------------------------------------------------------------

def _int(qs: dict, key: str, default: int, lo: int = None, hi: int = None) -> int:
    raw = qs.get(key, [None])[0]
    if raw is None or raw == "":
        return default
    try:
        val = int(float(raw))
    except ValueError:
        raise BadRequestError(f"{key} must be a number")
    if lo is not None and val < lo or hi is not None and val > hi:
        raise BadRequestError(f"{key} out of range")
    return val


def _choice(qs: dict, key: str, default: int, allowed) -> int:
    val = _int(qs, key, default)
    if val not in allowed:
        raise BadRequestError(f"{key} must be one of {sorted(allowed)}")
    return val


def parse_kids(raw: str) -> list:
    ages = []
    for part in (raw or "").replace(";", ",").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            age = int(float(part))
        except ValueError:
            raise BadRequestError("kids must be a comma-separated list of ages")
        ages.append(max(0, min(30, age)))
    return ages[:10]


def parse_household(qs: dict) -> dict:
    year = _int(qs, "year", MAX_YEAR, MIN_YEAR, MAX_YEAR)
    status = _choice(qs, "status", STATUS_SINGLE, (1, 2, 3, 4))
    couple = status in COUPLE_STATUSES
    mode = qs.get("mode", ["gross"])[0]
    if mode not in ("gross", "taxable"):
        raise BadRequestError("mode must be gross or taxable")
    h = {
        "loc": _int(qs, "loc", 800100000, 1),
        "year": year,
        "status": status,
        "couple": couple,
        "kids": parse_kids(qs.get("kids", [""])[0]),
        "conf1": _choice(qs, "conf1", 4, CONFESSIONS),
        "conf2": _choice(qs, "conf2", 4, CONFESSIONS) if couple else 0,
        "mode": mode,
        "wealth": _int(qs, "wealth", 0, 0, 1_000_000_000),
        "inc1": _int(qs, "inc1", 100000, 0, 100_000_000),
        "type1": _choice(qs, "type1", 1, INCOME_TYPES),
        "inc2": _int(qs, "inc2", 0, 0, 100_000_000) if couple else 0,
        "type2": _choice(qs, "type2", 1, INCOME_TYPES) if couple else 0,
        "taxable": _int(qs, "taxable", 100000, 0, 100_000_000),
        "yob1": _int(qs, "yob1", 1990, 1900, year),
        "yob2": _int(qs, "yob2", 1990, 1900, year) if couple else 0,
    }
    h["age1"] = year - h["yob1"]
    h["age2"] = year - h["yob2"] if couple else 0
    if h["type1"] == 0:
        h["inc1"] = 0
    if h["type2"] == 0:
        h["inc2"] = 0
    return h


# --- upstream payloads ------------------------------------------------------------------------

def _common_payload(h: dict) -> dict:
    return {
        "SimKey": None,
        "TaxYear": h["year"],
        "Relationship": h["status"],
        "Confession1": h["conf1"],
        "Confession2": h["conf2"] if h["couple"] else 0,
        "Children": [{"Age": a} for a in h["kids"]],
    }


def simple_payload(h: dict, loc_id: int, taxable: int = None) -> dict:
    """API_calculateSimpleTaxes: taxable income is given, no deductions are applied."""
    taxable = h["taxable"] if taxable is None else taxable
    p = _common_payload(h)
    p.update({
        "TaxLocationID": loc_id,
        "TaxableIncomeCanton": taxable,
        "TaxableIncomeFed": taxable,
        "TaxableFortune": h["wealth"],
    })
    return p


def _gross_fields(h: dict, inc1: int = None, inc2: int = None) -> dict:
    inc1 = h["inc1"] if inc1 is None else inc1
    inc2 = h["inc2"] if inc2 is None else inc2
    f = {
        "Age1": h["age1"],
        "RevenueType1": h["type1"],
        "Revenue1": inc1 if h["type1"] else 0,
        "Fortune": h["wealth"],
    }
    if h["couple"]:
        f.update({"Age2": h["age2"], "RevenueType2": h["type2"], "Revenue2": inc2 if h["type2"] else 0})
    else:
        f.update({"Age2": 0, "RevenueType2": 0, "Revenue2": 0})
    return f


def detailed_payload(h: dict, loc_id: int, inc1: int = None, inc2: int = None) -> dict:
    """API_calculateDetailedTaxes: gross income; upstream applies the standard deductions."""
    p = _common_payload(h)
    p.update(_gross_fields(h, inc1, inc2))
    p.update({"TaxLocationID": loc_id, "Language": LANGUAGE_EN, "Budget": []})
    return p


def many_payload(h: dict, group_id: int) -> dict:
    """API_calculateManySimpleTaxes: gross income for every municipality of a canton (group_id = CantonID)."""
    p = _common_payload(h)
    p.update(_gross_fields(h))
    p["TaxGroupID"] = group_id
    return p


# --- normalisation ------------------------------------------------------------------------------

def _loc(raw: dict) -> dict:
    raw = raw or {}
    return {
        "id": raw.get("TaxLocationID"),
        "zip": raw.get("ZipCode") or "",
        "city": raw.get("City") or raw.get("BfsName") or "",
        "canton": raw.get("Canton") or "",
        "cantonId": raw.get("CantonID"),
        "bfsId": raw.get("BfsID"),
        "bfsName": raw.get("BfsName") or "",
    }


def normalize_row(r: dict) -> dict:
    """The tax amounts shared by every upstream calculation result."""
    if not isinstance(r, dict) or "TotalTax" not in r:
        raise EmptyResultError("upstream result has no TotalTax")
    g = lambda k: r.get(k) or 0
    return {
        "loc": _loc(r.get("Location")),
        "incomeTax": {"fed": g("IncomeTaxFed"), "canton": g("IncomeTaxCanton"), "city": g("IncomeTaxCity"), "church": g("IncomeTaxChurch")},
        "wealthTax": {"canton": g("FortuneTaxCanton"), "city": g("FortuneTaxCity"), "church": g("FortuneTaxChurch")},
        "personal": g("PersonalTax"),
        "credit": g("TaxCredit"),
        "total": g("TotalTax"),
        "net": g("TotalNetTax"),
    }


def _person(raw: dict) -> dict:
    raw = raw or {}
    g = lambda k: raw.get(k) or 0
    return {"gross": g("GrossIncome"), "ahv": g("AIOContribution"), "alv": g("ALVContribution"),
            "nbu": g("NBUContribution"), "bvg": g("BVGContribution"), "net": g("NetIncome")}


def _deductions(items: list) -> list:
    out = []
    for it in items or []:
        entry = it.get("Entry") or {}
        group = it.get("Group") or {}
        out.append({
            "id": entry.get("ID"),
            "group": {k.lower(): group.get(k) for k in ("DE", "FR", "IT", "EN")},
            "label": {k.lower(): entry.get(k) for k in ("DE", "FR", "IT", "EN")},
            "value": it.get("Value") or 0,
        })
    return out


def normalize_detailed(r: dict) -> dict:
    row = normalize_row(r)
    g = lambda k: r.get(k) or 0
    row.update({
        "taxableIncomeFed": g("TaxableIncomeFed"),
        "taxableIncomeCanton": g("TaxableIncomeCanton"),
        "taxableWealth": g("TaxableFortuneCanton"),
        "marginalRate": r.get("MarginalTaxRate"),
        "taxFreedomDay": r.get("TaxFreedomDay"),
        "p1": _person(r.get("IncomeP1")),
        "p2": _person(r.get("IncomeP2")),
        "deductions": {"fed": _deductions(r.get("InfoFed")), "canton": _deductions(r.get("InfoCanton"))},
    })
    return row


def normalize_simple(r: dict, h: dict, taxable: int = None) -> dict:
    row = normalize_row(r)
    taxable = h["taxable"] if taxable is None else taxable
    row.update({
        "taxableIncomeFed": taxable,
        "taxableIncomeCanton": taxable,
        "taxableWealth": h["wealth"],
        "marginalRate": None,
    })
    return row


def household_income(h: dict) -> int:
    return h["inc1"] + h["inc2"] if h["mode"] == "gross" else h["taxable"]


def split_income(h: dict, total: int):
    """Split a household income between the two persons in the ratio of the entered incomes."""
    base = h["inc1"] + h["inc2"]
    if not h["couple"] or h["type2"] == 0 or base <= 0:
        return total, 0
    inc1 = round(total * h["inc1"] / base)
    return inc1, total - inc1


# --- calculations -------------------------------------------------------------------------------

def calc_one(h: dict, loc_id: int = None, income: int = None) -> dict:
    """One location at the household's income (or `income` instead), with the marginal rate."""
    loc_id = h["loc"] if loc_id is None else loc_id
    if h["mode"] == "gross":
        total = household_income(h) if income is None else income
        inc1, inc2 = split_income(h, total)
        raw = post_upstream("API_calculateDetailedTaxes", detailed_payload(h, loc_id, inc1, inc2))
        return normalize_detailed(raw)
    taxable = h["taxable"] if income is None else income
    # No marginal rate from upstream in this mode: take the tax on the next CHF 1'000
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_base = ex.submit(post_upstream, "API_calculateSimpleTaxes", simple_payload(h, loc_id, taxable))
        f_next = ex.submit(post_upstream, "API_calculateSimpleTaxes", simple_payload(h, loc_id, taxable + 1000))
        row = normalize_simple(f_base.result(), h, taxable)
        nxt = normalize_row(f_next.result())
    row["marginalRate"] = round((nxt["total"] - row["total"]) / 10, 1)
    return row


def calc_compare(h: dict) -> dict:
    """Every municipality (gross mode, 26 canton-wide calls) or the 26 cantonal capitals (taxable mode)."""
    if h["mode"] == "gross":
        with ThreadPoolExecutor(max_workers=26) as ex:
            results = list(ex.map(lambda c: post_upstream("API_calculateManySimpleTaxes", many_payload(h, c[0])), CANTONS))
        rows = [compare_row(r) for res in results for r in (res or [])]
        if not rows:
            raise EmptyResultError("no municipalities from upstream")
        scope = "municipalities"
    else:
        with ThreadPoolExecutor(max_workers=26) as ex:
            results = list(ex.map(lambda c: post_upstream("API_calculateSimpleTaxes", simple_payload(h, c[3])), CANTONS))
        rows = [compare_row(r) for r in results]
        scope = "capitals"
    return {"scope": scope, "rows": rows}


def compare_row(r: dict) -> dict:
    """A compact row for the place comparison: 2'110 of them go over the wire."""
    row = normalize_row(r)
    loc = row["loc"]
    return {
        "loc": {"id": loc["id"], "city": loc["city"], "canton": loc["canton"], "cantonId": loc["cantonId"], "bfsId": loc["bfsId"]},
        "incomeTax": row["incomeTax"],
        "wealthTax": row["wealthTax"],
        "personal": row["personal"],
        "total": row["total"],
        "isCapital": loc["bfsId"] in CAPITAL_BFS_IDS,
    }


def calc_curve(h: dict) -> dict:
    incomes = list(CURVE_INCOMES)
    own = household_income(h)
    if own > 0 and own not in incomes:
        incomes.append(own)
    incomes.sort()
    with ThreadPoolExecutor(max_workers=10) as ex:
        rows = list(ex.map(lambda inc: calc_one(h, income=inc), incomes))
    points = []
    for inc, row in zip(incomes, rows):
        points.append({"income": inc, "total": row["total"], "marginalRate": row["marginalRate"],
                       "taxableIncomeFed": row["taxableIncomeFed"], "incomeTax": row["incomeTax"],
                       "wealthTax": row["wealthTax"], "personal": row["personal"]})
    return {"points": points, "ownIncome": own}


def calc_history(h: dict) -> dict:
    years = list(range(MIN_YEAR, MAX_YEAR + 1))

    def one(year):
        hy = dict(h, year=year, age1=year - h["yob1"], age2=(year - h["yob2"]) if h["couple"] else 0)
        try:
            return calc_one(hy)
        except Exception as e:  # one missing year must not sink the whole series
            logging.warning("history %d failed: %s", year, e)
            return None

    with ThreadPoolExecutor(max_workers=10) as ex:
        rows = list(ex.map(one, years))
    if not any(rows):
        raise EmptyResultError("no history from upstream")
    points = []
    for year, row in zip(years, rows):
        if row is None:
            points.append({"year": year, "total": None})
            continue
        points.append({"year": year, "total": row["total"], "incomeTax": row["incomeTax"],
                       "wealthTax": row["wealthTax"], "personal": row["personal"],
                       "taxableIncomeFed": row["taxableIncomeFed"], "marginalRate": row["marginalRate"]})
    return {"points": points}


def search_locations(query: str, year: int) -> list:
    query = (query or "").strip()
    if len(query) < 2:
        return []
    res = post_upstream("API_searchLocation", {"Search": query, "Language": LANGUAGE_EN, "TaxYear": year})
    return [_loc(r) for r in (res or [])][:40]


def meta() -> dict:
    return {
        "minYear": MIN_YEAR,
        "maxYear": MAX_YEAR,
        "cantons": [{"id": cid, "abbr": abbr, "capitalBfsId": bfs, "capitalLocId": loc} for cid, abbr, bfs, loc in CANTONS],
        "source": "https://swisstaxcalculator.estv.admin.ch",
    }


# --- routing --------------------------------------------------------------------------------------

# Cache lifetime per endpoint (seconds); None means the default of one hour
CACHE_SECONDS = {"/api/locations": 86400, "/api/meta": 86400}


def handle_api_request(path: str, qs: dict) -> dict:
    if path == "/api/meta":
        return meta()
    if path == "/api/locations":
        year = _int(qs, "year", MAX_YEAR, MIN_YEAR, MAX_YEAR)
        return {"locations": search_locations(qs.get("q", [""])[0], year)}
    if path == "/api/calculate":
        h = parse_household(qs)
        return {"household": h, "result": calc_one(h)}
    if path == "/api/compare":
        h = parse_household(qs)
        return dict(calc_compare(h), household=h)
    if path == "/api/curve":
        h = parse_household(qs)
        return dict(calc_curve(h), household=h)
    if path == "/api/history":
        h = parse_household(qs)
        return dict(calc_history(h), household=h)
    raise NotFoundError(f"Unknown API endpoint: {path}")


def error_status(e: Exception) -> int:
    if isinstance(e, NotFoundError):
        return 404
    if isinstance(e, BadRequestError):
        return 400
    # upstream too slow (before or after connecting) or not reachable: refusing connections is how it rate-limits
    if isinstance(e, TimeoutError) or (isinstance(e, urllib.error.URLError) and isinstance(e.reason, TimeoutError)):
        return 504
    if isinstance(e, (EmptyResultError, urllib.error.URLError, ConnectionError)):
        return 502
    return 500


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        try:
            data = handle_api_request(parsed.path, qs)
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", f"s-maxage={CACHE_SECONDS.get(parsed.path, 3600)}, stale-while-revalidate")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            status = error_status(e)
            log = logging.exception if status == 500 else logging.warning
            log("GET %s -> %d: %s", self.path, status, e)
            body = json.dumps({"error": HTTPStatus(status).phrase}, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)
