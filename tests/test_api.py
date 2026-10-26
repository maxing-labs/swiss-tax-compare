"""Offline tests for api/index.py: upstream calls are replaced by the snapshots in tests/fixtures/
(regenerate with `python3 -m tests.make_fixtures`)."""
import http.client
import json
import threading
import unittest
import urllib.error
import urllib.parse
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

import api.index as api
import server

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def fake_upstream(operation, payload):
    """Stand-in for api.post_upstream keyed on the operation and a few payload fields."""
    if operation == "API_calculateDetailedTaxes":
        return fixture("detailed_zh.json")
    if operation == "API_calculateSimpleTaxes":
        return fixture("simple_zh_plus1000.json" if payload["TaxableIncomeCanton"] == 101000 else "simple_zh.json")
    if operation == "API_calculateManySimpleTaxes":
        return fixture("many_zg.json") if payload["TaxGroupID"] == 25 else []
    if operation == "API_searchLocation":
        return fixture("search_lausanne.json") if payload["Search"].lower().startswith("lausa") else []
    raise AssertionError(f"unexpected operation {operation}")


def qs(query):
    return urllib.parse.parse_qs(query)


class HouseholdTest(unittest.TestCase):
    def test_defaults(self):
        h = api.parse_household({})
        self.assertEqual((h["loc"], h["year"], h["status"], h["mode"]), (800100000, api.MAX_YEAR, 1, "gross"))
        self.assertFalse(h["couple"])
        self.assertEqual(h["conf2"], 0)
        self.assertEqual(h["age1"], api.MAX_YEAR - 1990)

    def test_couple_fields_only_for_married_or_partnership(self):
        single = api.parse_household(qs("status=3&inc2=50000&type2=1&conf2=2"))
        self.assertEqual((single["inc2"], single["type2"], single["conf2"]), (0, 0, 0))
        married = api.parse_household(qs("status=2&inc2=50000&type2=1&conf2=2&yob2=1985"))
        self.assertTrue(married["couple"])
        self.assertEqual((married["inc2"], married["type2"], married["conf2"], married["age2"]), (50000, 1, 2, api.MAX_YEAR - 1985))

    def test_no_income_type_zeroes_the_income(self):
        h = api.parse_household(qs("type1=0&inc1=90000"))
        self.assertEqual(h["inc1"], 0)

    def test_kids(self):
        self.assertEqual(api.parse_kids("4, 9"), [4, 9])
        self.assertEqual(api.parse_kids(""), [])
        self.assertEqual(api.parse_kids("40"), [30])
        with self.assertRaises(api.BadRequestError):
            api.parse_kids("a,b")

    def test_invalid_values(self):
        for query in ["status=9", "year=1999", "mode=x", "conf1=7", "type1=5", "inc1=abc", "yob1=1800"]:
            with self.subTest(query=query), self.assertRaises(api.BadRequestError):
                api.parse_household(qs(query))


class PayloadTest(unittest.TestCase):
    def test_simple_payload(self):
        h = api.parse_household(qs("mode=taxable&taxable=80000&wealth=20000&conf1=2&kids=5"))
        p = api.simple_payload(h, 300000000)
        self.assertEqual(p["TaxLocationID"], 300000000)
        self.assertEqual((p["TaxableIncomeCanton"], p["TaxableIncomeFed"], p["TaxableFortune"]), (80000, 80000, 20000))
        self.assertEqual(p["Children"], [{"Age": 5}])
        self.assertEqual((p["Relationship"], p["Confession1"], p["Confession2"]), (1, 2, 0))

    def test_detailed_payload_married(self):
        h = api.parse_household(qs("status=2&inc1=120000&inc2=80000&type2=3&yob1=1990&yob2=1960&conf2=1"))
        p = api.detailed_payload(h, 800100000)
        self.assertEqual((p["Revenue1"], p["RevenueType1"], p["Age1"]), (120000, 1, api.MAX_YEAR - 1990))
        self.assertEqual((p["Revenue2"], p["RevenueType2"], p["Age2"], p["Confession2"]), (80000, 3, api.MAX_YEAR - 1960, 1))
        self.assertEqual(p["Budget"], [])
        self.assertEqual(p["Language"], api.LANGUAGE_EN)

    def test_many_payload_uses_canton_as_group(self):
        h = api.parse_household(qs("inc1=100000"))
        p = api.many_payload(h, 26)
        self.assertEqual(p["TaxGroupID"], 26)
        self.assertEqual((p["Revenue2"], p["RevenueType2"], p["Age2"]), (0, 0, 0))

    def test_split_income_keeps_the_ratio(self):
        h = api.parse_household(qs("status=2&inc1=120000&inc2=80000&type2=1"))
        self.assertEqual(api.split_income(h, 100000), (60000, 40000))
        self.assertEqual(api.split_income(api.parse_household(qs("inc1=120000")), 50000), (50000, 0))


class NormalizeTest(unittest.TestCase):
    def test_detailed(self):
        row = api.normalize_detailed(fixture("detailed_zh.json"))
        self.assertEqual(row["loc"]["bfsId"], 261)
        self.assertEqual(row["loc"]["canton"], "ZH")
        self.assertGreater(row["total"], 0)
        self.assertEqual(row["total"], row["incomeTax"]["fed"] + row["incomeTax"]["canton"] + row["incomeTax"]["city"]
                         + row["incomeTax"]["church"] + sum(row["wealthTax"].values()) + row["personal"])
        self.assertEqual(row["p1"]["gross"], 120000)
        self.assertGreater(row["marginalRate"], 0)
        self.assertTrue(row["deductions"]["fed"])
        self.assertIn("en", row["deductions"]["fed"][0]["label"])

    def test_simple_marginal_rate_from_next_thousand(self):
        h = api.parse_household(qs("mode=taxable&taxable=100000&wealth=50000"))
        with mock.patch.object(api, "post_upstream", fake_upstream):
            row = api.calc_one(h)
        base, nxt = fixture("simple_zh.json"), fixture("simple_zh_plus1000.json")
        self.assertEqual(row["total"], base["TotalTax"])
        self.assertEqual(row["marginalRate"], round((nxt["TotalTax"] - base["TotalTax"]) / 10, 1))
        self.assertEqual(row["taxableIncomeFed"], 100000)

    def test_missing_total_is_an_empty_result(self):
        with self.assertRaises(api.EmptyResultError):
            api.normalize_row({"Location": {}})
        with self.assertRaises(api.EmptyResultError):
            api.normalize_row(None)


class EndpointTest(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(api, "post_upstream", fake_upstream)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_calculate_gross(self):
        data = api.handle_api_request("/api/calculate", qs("inc1=120000"))
        self.assertEqual(data["household"]["inc1"], 120000)
        self.assertEqual(data["result"]["total"], fixture("detailed_zh.json")["TotalTax"])

    def test_compare_gross_marks_capitals(self):
        data = api.handle_api_request("/api/compare", qs("inc1=120000"))
        self.assertEqual(data["scope"], "municipalities")
        rows = data["rows"]
        self.assertEqual(len(rows), len(fixture("many_zg.json")))
        self.assertEqual([r["loc"]["city"] for r in rows if r["isCapital"]], ["Zug"])
        self.assertEqual(set(rows[0]), {"loc", "incomeTax", "wealthTax", "personal", "total", "isCapital"})

    def test_compare_taxable_is_capitals_only(self):
        data = api.handle_api_request("/api/compare", qs("mode=taxable&taxable=100000"))
        self.assertEqual(data["scope"], "capitals")
        self.assertEqual(len(data["rows"]), 26)
        self.assertTrue(all(r["isCapital"] for r in data["rows"]))

    def test_curve_includes_own_income(self):
        data = api.handle_api_request("/api/curve", qs("inc1=123456"))
        incomes = [p["income"] for p in data["points"]]
        self.assertIn(123456, incomes)
        self.assertEqual(incomes, sorted(incomes))

    def test_history_years(self):
        data = api.handle_api_request("/api/history", qs("inc1=120000"))
        self.assertEqual([p["year"] for p in data["points"]], list(range(api.MIN_YEAR, api.MAX_YEAR + 1)))

    def test_locations(self):
        data = api.handle_api_request("/api/locations", qs("q=Lausa"))
        self.assertEqual(data["locations"][0]["canton"], "VD")
        self.assertEqual(api.handle_api_request("/api/locations", qs("q=L")), {"locations": []})

    def test_unknown_path(self):
        with self.assertRaises(api.NotFoundError):
            api.handle_api_request("/api/nope", {})


class HttpTest(unittest.TestCase):
    """Both handlers (Vercel's and the dev server's) over a real socket: status codes and cache headers."""

    @classmethod
    def setUpClass(cls):
        cls.servers = []
        for handler in (api.handler, server.TaxHandler):
            srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            threading.Thread(target=srv.serve_forever, daemon=True).start()
            cls.servers.append(srv)

    @classmethod
    def tearDownClass(cls):
        for srv in cls.servers:
            srv.shutdown()
            srv.server_close()

    def get(self, srv, path):
        conn = http.client.HTTPConnection(*srv.server_address, timeout=5)
        conn.request("GET", path)
        res = conn.getresponse()
        body = res.read()
        conn.close()
        return res, body

    def test_status_codes_and_cache_headers(self):
        with mock.patch.object(api, "post_upstream", fake_upstream):
            for srv in self.servers:
                res, body = self.get(srv, "/api/calculate?inc1=120000")
                self.assertEqual(res.status, 200)
                self.assertEqual(json.loads(body)["result"]["loc"]["canton"], "ZH")
                res, _ = self.get(srv, "/api/calculate?status=9")
                self.assertEqual(res.status, 400)
                self.assertIsNone(res.getheader("Cache-Control"))
                res, _ = self.get(srv, "/api/nope")
                self.assertEqual(res.status, 404)
            res, _ = self.get(self.servers[0], "/api/calculate?inc1=120000")
            self.assertEqual(res.getheader("Cache-Control"), "s-maxage=3600, stale-while-revalidate")
            res, _ = self.get(self.servers[0], "/api/meta")
            self.assertEqual(res.getheader("Cache-Control"), "s-maxage=86400, stale-while-revalidate")

    def test_upstream_failure_is_a_502_without_cache(self):
        with mock.patch.object(api, "post_upstream", lambda op, payload: None):
            res, body = self.get(self.servers[0], "/api/calculate?inc1=120000")
        self.assertEqual(res.status, 502)
        self.assertIsNone(res.getheader("Cache-Control"))

    def test_upstream_unreachable_or_slow_is_a_502_or_504_without_cache(self):
        # Connection refused is how upstream rate-limits; a slow upstream times out before or after connecting
        cases = [
            (urllib.error.URLError(ConnectionRefusedError(61, "Connection refused")), 502),
            (ConnectionResetError(54, "Connection reset by peer"), 502),
            (urllib.error.URLError(TimeoutError("timed out")), 504),
            (TimeoutError("timed out"), 504),
        ]
        for error, status in cases:
            for srv in self.servers:
                with self.subTest(error=repr(error), handler=srv.RequestHandlerClass.__name__), \
                        mock.patch("urllib.request.urlopen", side_effect=error), \
                        self.assertLogs(level="WARNING") as logs:
                    res, body = self.get(srv, "/api/calculate?inc1=120000")
                    self.assertEqual(res.status, status)
                    self.assertIsNone(res.getheader("Cache-Control"))
                    self.assertIn("error", json.loads(body))
                    # one warning line, no traceback
                    self.assertEqual([(r.levelname, r.exc_info) for r in logs.records], [("WARNING", None)])


if __name__ == "__main__":
    unittest.main()
