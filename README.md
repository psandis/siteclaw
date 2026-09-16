# siteclaw

[![npm version](https://img.shields.io/npm/v/siteclaw.svg)](https://www.npmjs.com/package/siteclaw)

A CLI that tracks Lighthouse performance history across a portfolio of client sites (WordPress or custom-built — anything reachable by public URL), correlates regressions with deploy events, and flags shared root causes across sites that use the same theme, plugin, or shared asset.

**Status: implemented and tested.** `check`, `list`, `history`, and `correlate` all work end-to-end against real Lighthouse runs. `list` and `correlate` only show sites currently listed in `sites.json`; older runs for sites removed from that file stay in the database but are hidden from those views. This document still records the research and scope decisions behind the design below.

## Problem

Google's own PageSpeed Insights (and every third-party wrapper around it) answers "how is this one page scoring right now." None of them answer the question that actually matters when you maintain several client sites — WordPress or otherwise: "did my last deploy make this specific site slower, and is it the same root cause as the last three regressions I fixed on other clients?"

The operator's current portfolio is primarily WordPress (Kadence/Divi 5), which is why WordPress-specific tooling (WP-CLI) was evaluated below, but nothing in this tool's design depends on a site being WordPress. Any site reachable by public URL can be added.

## Competitive landscape

Before scoping this tool, the following existing projects were checked to avoid duplicating work that already exists:

| Tool | What it already does | Why it doesn't cover this use case |
|---|---|---|
| [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci/) | Official Google tool. Server component stores results in SQLite, shows score history over time. | Requires running and maintaining a server process; treats every URL independently, no cross-site correlation. |
| [lighthouse-batch](https://github.com/mikestead/lighthouse-batch) | Runs Lighthouse across a list of sites in one command. | Per-site reports only, no history, no correlation across sites. |
| lighthouse-monitor | Runs Lighthouse against a URL list, retains reports, diffs two runs in a web UI. | Closest overlap to a naive "track scores over time" tool; still per-site, no cross-portfolio correlation and no deploy-event tagging. |
| [WP-CLI profile-command](https://github.com/wp-cli/profile-command) | Profiles WordPress bootstrap/query/template stages to find slow plugins/hooks, from inside the server. | Requires SSH/WP-CLI access to the site. Deliberately excluded from this project — see Non-goals. |
| CrUX API / HTTP Archive + BigQuery | Real-user field data and industry-wide performance benchmarks. | CrUX requires ~100+ monthly visits per URL to return data, which most small client sites won't meet; BigQuery adds a GCP billing setup for a comparison that doesn't change any remediation action. Both considered and dropped — see Non-goals. |

**Conclusion:** raw score tracking over time is already solved by existing tools. The actual gap is correlation: across a *specific, known portfolio* of sites the operator maintains, and across *their own deploy history*, neither of which any general-purpose tool can do because neither requires knowing you own multiple related sites.

## What this tool does differently

1. **Cross-site pattern correlation.** If several client sites share a theme or plugin (e.g. Kadence, Divi 5) and Lighthouse flags the same blocking script or oversized asset on more than one of them, siteclaw surfaces that as a single finding ("this affects 3 of your 5 sites") instead of three unrelated per-site reports. This requires knowing the sites belong to one operator's portfolio, which general Lighthouse tooling has no concept of.
2. **Deploy-event tagging.** `siteclaw check <site> --note "updated WooCommerce to 9.2"` attaches a note to that run. If the next run regresses, siteclaw flags it against the most recent note, so a score drop can be traced to the change that likely caused it, rather than only showing a bare timestamp.

Both features operate purely on Lighthouse's own JSON output and locally stored history. Neither requires new measurement technology.

## Non-goals (and why)

- **No server/plugin-level profiling (WP-CLI, Query Monitor).** Would require SSH or Application Password credentials to each client's production site. Explicitly rejected: the operator does not consider it acceptable to hand a CLI tool that kind of access, even to sites they administer themselves.
- **No automated fixing of flagged issues.** Lighthouse's own audit output already includes fix guidance per issue (e.g. exact files to defer, exact images to compress). siteclaw surfaces that guidance as text. It does not edit theme, plugin, or server files — doing so would require write access to a live site, a larger and riskier scope than reading.
- **No CrUX/HTTP Archive industry benchmarking.** Considered and dropped: CrUX's traffic-volume requirement means it would likely return empty for the smaller sites in scope, and BigQuery's setup overhead (GCP project/billing) isn't justified by a comparison that doesn't change what gets fixed.

## Architecture

**Data captured per run** (from Lighthouse's own JSON output only, no additional measurement):
- Performance score
- Render-blocking resources (specific script/stylesheet URLs)
- Opportunities: unoptimized images, unused CSS/JS, oversized payloads, with Lighthouse's own fix-guidance text
- Optional operator note (deploy/change annotation)

**Storage:** local SQLite database. Site list lives in a data file (`sites.json`), not hardcoded, so client sites can be added without touching code.

## Usage

```
siteclaw check <site> [--note "text"]   # run Lighthouse against the site, store the result
siteclaw list                           # latest score for every site in sites.json
siteclaw history <site>                 # score history + trend for one site
siteclaw correlate                      # shared render-blocking resources across sites
```

`sites.json`:
```json
[
  { "name": "client-a", "url": "https://client-a-domain.com" }
]
```

Real output, from a run against a live public WordPress installation:
```
$ siteclaw check techcrunch
Running Lighthouse against https://techcrunch.com...

techcrunch: performance score 37

Opportunities:
  Reduce unused CSS
  Reduce unused JavaScript (4110ms potential savings)
  Avoid enormous network payloads

$ siteclaw list
nasa            64   2026-09-16T20:46:54.909Z
rollingstone    21   2026-09-16T20:47:12.956Z
techcrunch      37   2026-09-16T20:46:40.141Z
```

## Configuration

Everything below is read from `siteclaw.config.json` at the project root. If the file is missing, these defaults are used.

```json
{
  "dbPath": "siteclaw.db",
  "sitesPath": "sites.json",
  "opportunityAudits": [
    "uses-optimized-images",
    "unused-css-rules",
    "unused-javascript",
    "total-byte-weight"
  ]
}
```

- `dbPath` — where the SQLite database is created/read
- `sitesPath` — where the site list is read from
- `opportunityAudits` — which Lighthouse audit IDs get surfaced as "opportunities" in `check` output (render-blocking-resources is always captured separately, regardless of this list)

## Testing

`pnpm test` runs the Vitest suite (`tests/`), covering the SQLite layer, the site-list loader, the config loader, and the cross-site correlation logic. Lighthouse itself is not mocked or covered by automated tests — it requires a real headless Chrome and a real network call, so it's verified manually via `siteclaw check` against a real URL instead.

## Tech stack

TypeScript/Node, [`lighthouse`](https://www.npmjs.com/package/lighthouse) + `chrome-launcher` for measurement, `better-sqlite3` for storage, `commander` for the CLI, `vitest` for tests, `biome` for lint/format, `pnpm` as package manager.

## License

Not yet decided.
