import { test } from "node:test";
import assert from "node:assert/strict";
import { I18N } from "../../static/js/i18n/index.js";

// Same keys, value types and function arities as en, recursively (guide cards, CSV headers, short labels)
function sameShape(ref, other, path) {
  assert.equal(typeof other, typeof ref, `${path}: type`);
  if (typeof ref === "function") {
    assert.equal(other.length, ref.length, `${path}: arity`);
  } else if (Array.isArray(ref)) {
    assert.ok(Array.isArray(other), `${path}: array`);
    assert.equal(other.length, ref.length, `${path}: length`);
    ref.forEach((v, i) => sameShape(v, other[i], `${path}[${i}]`));
  } else if (ref && typeof ref === "object") {
    assert.deepEqual(Object.keys(other).sort(), Object.keys(ref).sort(), `${path}: keys`);
    for (const k of Object.keys(ref)) sameShape(ref[k], other[k], `${path}.${k}`);
  }
}

test("de and zh have every en key, with the same shape", () => {
  assert.deepEqual(Object.keys(I18N).sort(), ["de", "en", "zh"]);
  for (const lang of ["de", "zh"]) sameShape(I18N.en, I18N[lang], lang);
});

test("guide cards keep their category codes, which pick the badge colour", () => {
  for (const lang of ["de", "zh"]) {
    assert.deepEqual(I18N[lang].guide.cards.map(c => c.cat), I18N.en.guide.cards.map(c => c.cat));
  }
});
