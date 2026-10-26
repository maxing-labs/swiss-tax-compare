import { test } from "node:test";
import assert from "node:assert/strict";
import { sameHousehold } from "../../static/js/state.js";
import { scenarioSummary } from "../../static/js/calc.js";

const single = {
  locationId: 800100000, year: 2026, status: 1, kids: [], conf1: 4, conf2: 4, mode: "gross",
  inc1: 100000, type1: 1, inc2: 0, type2: 1, yob1: 1990, yob2: 1990, taxable: 80000, wealth: 0
};

test("sameHousehold: fields hidden by the civil status or the income mode do not count", () => {
  assert.ok(sameHousehold(single, { ...single, inc2: 50000, conf2: 1, yob2: 1980, taxable: 1 }));
  assert.ok(!sameHousehold(single, { ...single, inc1: 100001 }));
  assert.ok(!sameHousehold(single, { ...single, kids: [4] }));
  assert.ok(!sameHousehold(single, { ...single, locationId: 630000000 }));

  const married = { ...single, status: 2 };
  assert.ok(!sameHousehold(married, { ...married, inc2: 50000 }));
  assert.ok(!sameHousehold(married, { ...married, conf2: 1 }));

  const taxable = { ...single, mode: "taxable" };
  assert.ok(sameHousehold(taxable, { ...taxable, inc1: 1, yob1: 1950, type1: 3 }));
  assert.ok(!sameHousehold(taxable, { ...taxable, taxable: 80001 }));
});

test("scenarioSummary: total and the effective rate against the entered income", () => {
  const calc = { household: { mode: "gross", inc1: 100000, inc2: 0 }, result: { total: 11848 } };
  assert.deepEqual(scenarioSummary(calc), { total: 11848, effective: 11.848 });
});
