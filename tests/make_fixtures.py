"""Capture upstream responses used by the offline tests (needs network):  python3 -m tests.make_fixtures"""
import json
from pathlib import Path

import api.index as api

FIXTURES = Path(__file__).parent / "fixtures"
H_GROSS = api.parse_household({"inc1": ["120000"], "yob1": ["1990"]})
H_TAXABLE = api.parse_household({"mode": ["taxable"], "taxable": ["100000"], "wealth": ["50000"]})


def main():
    FIXTURES.mkdir(exist_ok=True)
    fixtures = {
        "detailed_zh.json": ("API_calculateDetailedTaxes", api.detailed_payload(H_GROSS, 800100000)),
        "simple_zh.json": ("API_calculateSimpleTaxes", api.simple_payload(H_TAXABLE, 800100000)),
        "simple_zh_plus1000.json": ("API_calculateSimpleTaxes", api.simple_payload(H_TAXABLE, 800100000, 101000)),
        "many_zg.json": ("API_calculateManySimpleTaxes", api.many_payload(H_GROSS, 25)),
        "search_lausanne.json": ("API_searchLocation", {"Search": "Lausanne", "Language": 4, "TaxYear": 2026}),
    }
    for name, (op, payload) in fixtures.items():
        data = api.post_upstream(op, payload)
        (FIXTURES / name).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        print(name, "ok")


if __name__ == "__main__":
    main()
