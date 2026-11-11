import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUDGET_3A,
  BUDGET_OTHER_DEDUCTIONS,
  BadRequestError,
  EmptyResultError,
  LANGUAGE_EN,
  MAX_YEAR,
  MIN_YEAR,
  UpstreamNetworkError,
  UpstreamTimeoutError,
  calcOne,
  detailedPayload,
  handleApiRequest,
  handleRequest,
  manyPayload,
  meta,
  normalizeDetailed,
  normalizeRow,
  parseHousehold,
  parseKids,
  parseQs,
  pillar3aCaps,
  simplePayload,
  splitIncome,
} from "../../functions/api/[[path]].js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
}

function qs(query) {
  return parseQs(new URLSearchParams(query));
}

function fakeUpstream(operation, payload) {
  if (operation === "API_calculateDetailedTaxes") return fixture("detailed_zh.json");
  if (operation === "API_calculateSimpleTaxes") {
    return fixture(payload.TaxableIncomeCanton === 101000 ? "simple_zh_plus1000.json" : "simple_zh.json");
  }
  if (operation === "API_calculateManySimpleTaxes") {
    return payload.TaxGroupID === 25 ? fixture("many_zg.json") : [];
  }
  if (operation === "API_searchLocation") {
    return payload.Search.toLowerCase().startsWith("lausa") ? fixture("search_lausanne.json") : [];
  }
  throw new Error(`unexpected operation ${operation}`);
}

describe("Cloudflare Pages Function parity with api/index.py", () => {
  test("household parsing, payloads and normalisation match api/index.py", async () => {
    const def = parseHousehold({});
    assert.deepEqual([def.loc, def.year, def.status, def.mode], [800100000, MAX_YEAR, 1, "gross"]);
    assert.equal(def.couple, false);
    assert.equal(def.conf2, 0);
    assert.equal(def.age1, MAX_YEAR - 1990);

    const single = parseHousehold(qs("status=3&inc2=50000&type2=1&conf2=2"));
    assert.deepEqual([single.inc2, single.type2, single.conf2], [0, 0, 0]);
    const married = parseHousehold(qs("status=2&inc2=50000&type2=1&conf2=2&yob2=1985"));
    assert.equal(married.couple, true);
    assert.deepEqual([married.inc2, married.type2, married.conf2, married.age2], [50000, 1, 2, MAX_YEAR - 1985]);

    assert.equal(parseHousehold(qs("type1=0&inc1=90000")).inc1, 0);
    assert.deepEqual(parseKids("4, 9"), [4, 9]);
    assert.deepEqual(parseKids(""), []);
    assert.deepEqual(parseKids("40"), [30]);
    assert.throws(() => parseKids("a,b"), BadRequestError);

    for (const bad of ["status=9", "year=1999", "mode=x", "conf1=7", "type1=5", "inc1=abc", "yob1=1800"]) {
      assert.throws(() => parseHousehold(qs(bad)), BadRequestError);
    }

    const hs = parseHousehold(qs("mode=taxable&taxable=80000&wealth=20000&conf1=2&kids=5"));
    const sp = simplePayload(hs, 300000000);
    assert.equal(sp.TaxLocationID, 300000000);
    assert.deepEqual([sp.TaxableIncomeCanton, sp.TaxableIncomeFed, sp.TaxableFortune], [80000, 80000, 20000]);

    const hd = parseHousehold(qs("status=2&inc1=120000&inc2=80000&type2=3&yob1=1990&yob2=1960&conf2=1"));
    const dp = detailedPayload(hd, 800100000);
    assert.deepEqual([dp.Revenue1, dp.RevenueType1, dp.Age1], [120000, 1, MAX_YEAR - 1990]);
    assert.equal(dp.Language, LANGUAGE_EN);

    const mp = manyPayload(parseHousehold(qs("inc1=100000")), 26);
    assert.equal(mp.TaxGroupID, 26);
    assert.deepEqual(splitIncome(parseHousehold(qs("status=2&inc1=120000&inc2=80000&type2=1")), 100000), [60000, 40000]);

    const det = normalizeDetailed(fixture("detailed_zh.json"));
    assert.equal(det.loc.bfsId, 261);
    assert.equal(det.p1.gross, 120000);

    const hTax = parseHousehold(qs("mode=taxable&taxable=100000&wealth=50000"));
    const simpleRow = await calcOne(hTax, fakeUpstream);
    const base = fixture("simple_zh.json");
    const nxt = fixture("simple_zh_plus1000.json");
    assert.equal(simpleRow.total, base.TotalTax);
    assert.equal(simpleRow.marginalRate, Number(((nxt.TotalTax - base.TotalTax) / 10).toFixed(1)));

    assert.throws(() => normalizeRow({ Location: {} }), EmptyResultError);
    assert.throws(() => normalizeRow(null), EmptyResultError);
  });

  test("endpoints, savings tiers, subrequest limits (< 50) and status codes", async () => {
    const calc = await handleApiRequest("/api/calculate", qs("inc1=120000"), fakeUpstream);
    assert.equal(calc.result.total, fixture("detailed_zh.json").TotalTax);

    const cmpGross = await handleApiRequest("/api/compare", qs("inc1=120000"), fakeUpstream);
    assert.equal(cmpGross.scope, "municipalities");
    assert.deepEqual(
      cmpGross.rows.filter((r) => r.isCapital).map((r) => r.loc.city),
      ["Zug"],
    );

    const cmpTax = await handleApiRequest("/api/compare", qs("mode=taxable&taxable=100000"), fakeUpstream);
    assert.equal(cmpTax.scope, "capitals");
    assert.equal(cmpTax.rows.length, 26);

    // Check subrequest counts in worst-case taxable mode for curve & history
    let curveCalls = 0;
    const curveTax = await handleApiRequest("/api/curve", qs("mode=taxable&taxable=123456"), async (op, p) => {
      curveCalls++;
      return fakeUpstream(op, p);
    });
    assert.ok(curveCalls < 50, `curveCalls=${curveCalls}`);
    assert.ok(curveTax.points.some((p) => p.income === 123456));

    let histCalls = 0;
    const histTax = await handleApiRequest("/api/history", qs("mode=taxable&taxable=100000"), async (op, p) => {
      histCalls++;
      return fakeUpstream(op, p);
    });
    assert.ok(histCalls < 50, `histCalls=${histCalls}`);
    assert.equal(histTax.points.length, MAX_YEAR - MIN_YEAR + 1);

    const locs = await handleApiRequest("/api/locations", qs("q=Lausa"), fakeUpstream);
    assert.equal(locs.locations[0].canton, "VD");
    assert.deepEqual(await handleApiRequest("/api/locations", qs("q=L"), fakeUpstream), { locations: [] });

    // Savings tiers & 13-canton batch subrequest count (< 50)
    const BUDGET = [
      { Ident: "KKPRAEMIEN", Value: 4560 },
      { Ident: BUDGET_3A, Value: 0 },
      { Ident: BUDGET_OTHER_DEDUCTIONS, Value: 0 },
    ];
    let savCalls = 0;
    const fakeSavings = async (op, p) => {
      savCalls++;
      if (op === "API_calculateTaxBudget") return BUDGET.map((it) => ({ ...it }));
      let taxable;
      if (op === "API_calculateDetailedTaxes") {
        const b = Object.fromEntries(p.Budget.map((it) => [it.Ident, it.Value]));
        taxable = 100000 - (b[BUDGET_3A] || 0) - (b[BUDGET_OTHER_DEDUCTIONS] || 0);
      } else {
        taxable = p.TaxableIncomeCanton;
      }
      return { ...fixture("detailed_zh.json"), TotalTax: Math.trunc(taxable / 4), TaxableIncomeFed: taxable };
    };

    const savPlace = await handleApiRequest("/api/savings", qs("inc1=120000&pillar3a=7000&bvg=10000"), fakeSavings);
    assert.deepEqual(savPlace.tiers.map((t) => t.total), [25000, 23250, 20750]);
    assert.deepEqual(savPlace.tiers.map((t) => t.saved), [0, 1750, 4250]);
    assert.deepEqual(savPlace.tiers.map((t) => t.perFranc), [null, 0.25, 0.25]);

    savCalls = 0;
    const savBatch = await handleApiRequest(
      "/api/savings",
      qs("inc1=120000&scope=capitals&cantons=1,2,3,4,5,6,7,8,9,10,11,12,13&bvg=5000"),
      fakeSavings,
    );
    assert.equal(savBatch.rows.length, 13);
    assert.equal(savCalls, 40); // 1 budget + 13 * 3 tiers = 40 < 50

    assert.equal(pillar3aCaps(2024).withPension, 7056);
    assert.equal(meta().pillar3aCaps["2026"].selfEmployed, 36288);

    // HTTP status codes and Cache-Control
    const res200 = await handleRequest(new Request("https://swiss-tax-compare.pages.dev/api/calculate?inc1=120000"), {
      postUpstream: fakeUpstream,
    });
    assert.equal(res200.status, 200);
    assert.match(res200.headers.get("Cache-Control"), /s-maxage=3600/);

    const resMeta = await handleRequest(new Request("https://swiss-tax-compare.pages.dev/api/meta"), {
      postUpstream: fakeUpstream,
    });
    assert.equal(resMeta.status, 200);
    assert.match(resMeta.headers.get("Cache-Control"), /s-maxage=86400/);

    const res400 = await handleRequest(new Request("https://swiss-tax-compare.pages.dev/api/calculate?status=9"), {
      postUpstream: fakeUpstream,
    });
    assert.equal(res400.status, 400);
    assert.equal(res400.headers.get("Cache-Control"), null);

    const res404 = await handleRequest(new Request("https://swiss-tax-compare.pages.dev/api/nope"), {
      postUpstream: fakeUpstream,
    });
    assert.equal(res404.status, 404);
    assert.equal(res404.headers.get("Cache-Control"), null);

    const res502 = await handleRequest(new Request("https://swiss-tax-compare.pages.dev/api/calculate?inc1=120000"), {
      postUpstream: async () => {
        throw new UpstreamNetworkError("Connection refused");
      },
    });
    assert.equal(res502.status, 502);
    assert.equal(res502.headers.get("Cache-Control"), null);

    const res504 = await handleRequest(new Request("https://swiss-tax-compare.pages.dev/api/calculate?inc1=120000"), {
      postUpstream: async () => {
        throw new UpstreamTimeoutError("timed out");
      },
    });
    assert.equal(res504.status, 504);
    assert.equal(res504.headers.get("Cache-Control"), null);
  });
});
