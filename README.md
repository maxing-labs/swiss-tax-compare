# Swiss Tax Compare

Income and wealth tax for every Swiss municipality, from the official calculator of the Swiss Federal Tax Administration (FTA / ESTV): see where your money goes, and compare your place with all 2'110 municipalities for the same household.

**Live:** https://swiss-tax-compare.vercel.app

Swiss Tax Compare is an independent hobby project and is not affiliated with the FTA. Every figure comes live from the engine behind [swisstaxcalculator.estv.admin.ch](https://swisstaxcalculator.estv.admin.ch); results are estimates with standard deductions and are not tax advice.

## What it does

- Enter gross income (standard deductions applied by the FTA calculator) or taxable income, civil status, children, church, wealth and tax year (2010–2026).
- **Your Tax:** total, effective and marginal rate, the split between federal, cantonal, municipal and church tax, and the path from gross to taxable income.
- **Compare Places:** the same household in every municipality of Switzerland (or one canton, or the 26 capitals): ranking, difference to your place, chart, CSV export.
- **Tax Guide:** the Swiss tax system in seven cards.
- Shareable URLs; inputs stay in your browser. No accounts, no tracking.

Tabs: Your Tax, Compare Places, Income Curve, History, Tax Savings (what a pillar 3a contribution and a BVG buy-in save, here and in the 26 cantonal capitals), Tax Guide.

Planned next (see [`.agents/docs/roadmap.md`](.agents/docs/roadmap.md)): income curve, 2010–2026 history, saved scenarios, German and Chinese UI.

## Running it

No dependencies: the backend is Python standard library only, the frontend is plain ES modules with no build step.

```sh
python3 server.py                  # http://127.0.0.1:8766
python3 -m unittest                # backend tests, offline, against the snapshots in tests/fixtures/
node --test 'tests/js/*.test.mjs'  # frontend unit tests (Node >= 22)
```

Production runs on Vercel: `vercel.json` routes `/api/*` to `api/index.py` and everything else to `static/`.

## Built with coding agents

Like its sibling [Priminfo Pro](https://swiss-insurance-compare.vercel.app) (health insurance premiums), every commit so far was written by an AI coding agent. [`AGENTS.md`](AGENTS.md) is the brief every agent reads first; [`.agents/docs/`](.agents/docs/) holds one record per session and the roadmap. The notes are in Chinese, the language the maintainer uses with the agents.

## License

[MIT](LICENSE). The self-hosted fonts Fraunces and IBM Plex Sans are distributed under the SIL Open Font License; see `static/fonts/`.
