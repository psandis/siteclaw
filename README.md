# Siteclaw

[![npm version](https://img.shields.io/npm/v/siteclaw.svg?style=flat-square)](https://www.npmjs.com/package/siteclaw)

Lighthouse-backed performance history tracker for a portfolio of client sites. See which sites are slow, why, and whether several sites share the same root cause. Works standalone or as an OpenClaw skill.

## What It Does

- runs Lighthouse against any site (by name from `sites.json`, a bare domain, or a full URL) and stores the result
- reports all six Core Web Vitals (FCP, LCP, Speed Index, TTI, TBT, CLS), rated against Google's published thresholds — not just the aggregate score
- diagnostics: server response time (TTFB), DOM size, network request/byte totals, named third-party origin impact, legacy/duplicated JavaScript, HTTP/1.1 usage
- security checks: HTTPS, HSTS, CSP against XSS
- `--device mobile|desktop|both` — run either or both of Lighthouse's real device presets
- tracks performance score history per site, with a trend indicator and a comparison against the previous run
- correlates shared render-blocking resources across sites (e.g. the same theme/plugin asset slowing down several client sites at once)
- attaches an optional note to a run (e.g. "deployed plugin update") to trace a regression back to a change
- `--json` flag on all commands for agents and scripts

## Requirements

- Node 22+
- pnpm

## Install

```bash
npm install -g siteclaw
```

or, for local development:

```bash
git clone https://github.com/psandis/siteclaw.git
cd siteclaw
pnpm install
pnpm build
```

## Quick Start

```bash
# sites.json: array of sites to track
echo '[{ "name": "client-a", "url": "https://client-a-domain.com" }]' > sites.json

siteclaw check client-a --note "deployed plugin update"
siteclaw check https://example.com    # one-off check, no sites.json entry needed
siteclaw list
siteclaw history client-a
siteclaw correlate
```

(Running from a clone instead of a global install? Use `pnpm dev <command>` in place of `siteclaw <command>`.)

## CLI

### Check a site

```
siteclaw check techcrunch

Running Lighthouse (mobile) against https://techcrunch.com...

techcrunch [mobile]: performance score 36

Core metrics:
  First Contentful Paint: 14866ms (poor)
  Largest Contentful Paint: 28031ms (poor)
  Speed Index: 14866ms (poor)
  Time to Interactive: 29791ms (poor)
  Total Blocking Time: 813ms (poor)
  Cumulative Layout Shift: 0.000 (good)

Opportunities:
  Reduce unused CSS: Reduce unused rules from stylesheets and defer CSS not used for above-the-fold content to decrease bytes consumed by network activity. [Learn how to reduce unused CSS](https://developer.chrome.com/docs/lighthouse/performance/unused-css-rules/).
  Reduce unused JavaScript: Reduce unused JavaScript and defer loading scripts until they are required to decrease bytes consumed by network activity. [Learn how to reduce unused JavaScript](https://developer.chrome.com/docs/lighthouse/performance/unused-javascript/). (3740ms potential savings)
  Avoid enormous network payloads: Large network payloads cost users real money and are highly correlated with long load times. [Learn how to reduce payload sizes](https://developer.chrome.com/docs/lighthouse/performance/total-byte-weight/).

Diagnostics:
  Server response time (TTFB): 18ms
  DOM elements: 7118
  Network requests: 186 (3.9MB transferred)
  Unnecessary legacy JS (old-browser polyfills/transforms): 25.1KB
  Third-party impact (main-thread time):
    Google Tag Manager: 145ms, 521.5KB
    servenobid.com: 110ms, 438.2KB
    Google CDN: 83ms, 347.4KB
    Facebook: 79ms, 189.9KB
    Google/Doubleclick Ads: 54ms, 270.4KB

Security:
  HTTPS: yes
  HSTS header: present
  CSP against XSS: configured

Vs. previous check (2026-09-16T22:12:13.034Z): score down 10, LCP +23782ms
```

Notes:

- accepts either a name from `sites.json`, a bare domain (`www.example.com`), or a full `http(s)://` URL — no `sites.json` entry required for the latter two
- `--note <text>` attaches a note to the run, useful for tracing a later regression back to a specific change
- `--device mobile|desktop|both` — defaults to `mobile` (Lighthouse's own default, and how most real-world traffic arrives); `both` runs and reports each device separately, each compared against its own device-specific history
- Core metric ratings (good / needs improvement / poor) use Google's own published Core Web Vitals / Lighthouse thresholds
- server response time (TTFB), legacy/duplicated JavaScript, and HTTP/1.1 usage only print when non-zero, so a clean result doesn't clutter the output
- third-party impact and security checks (HTTPS, HSTS, CSP) come from Lighthouse's `best-practices` category, run alongside `performance`
- the "vs. previous check" line is skipped for the metric comparison (score still shown) if the previous run predates core-metrics tracking, rather than showing a misleading diff against missing data

### List all sites

```
siteclaw list

nasa            64   2026-09-16T20:46:54.909Z
rollingstone    21   2026-09-16T20:47:12.956Z
techcrunch      46   2026-09-16T22:12:13.034Z
```

Notes:

- only shows sites currently listed in `sites.json`; older runs for sites removed from that file stay in the database but are hidden here

### History for one site

```
siteclaw history techcrunch

2026-09-16T20:46:40.141Z	37
2026-09-16T21:48:00.486Z	42 note: second check for real history example
2026-09-16T22:07:20.149Z	44
2026-09-16T22:09:31.502Z	34
2026-09-16T22:12:13.034Z	46

Trend: up 12
```

### Correlate shared issues

```
siteclaw correlate

No shared render-blocking resources found across sites.
```

Notes:

- compares the latest run of every site currently in `sites.json`
- flags render-blocking resource URLs that appear on more than one site — usually a shared theme or plugin asset; the example above shows the real "nothing shared" case for a portfolio of unrelated sites (techcrunch/nasa/rollingstone don't share assets). When two sites do share one, the line reads `<url> -> affects: <site-a>, <site-b>`.

## Configuration

All defaults live in `siteclaw.config.json` at the project root. No code changes needed to:

- change where the SQLite database (`dbPath`) or site list (`sitesPath`) live
- change which Lighthouse audits (`opportunityAudits`) get surfaced as opportunities

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

If the file is missing, these same values are used as built-in defaults.

## Agent Integration

All commands support `--json` for structured output:

```bash
siteclaw --json check techcrunch
siteclaw --json list
siteclaw --json history techcrunch
siteclaw --json correlate
```

### OpenClaw Skill

Once installed globally (`npm install -g siteclaw`), add a `SKILL.md` to your workspace:

```markdown
---
name: siteclaw
description: Lighthouse performance history tracker for a portfolio of client sites
version: 0.2.1
requires_binaries:
  - siteclaw
---

When the user asks about site performance, regressions, or shared issues across client
sites, use the `siteclaw` CLI:

- To check a site: `siteclaw --json check <site-or-url>`
- To list all tracked sites: `siteclaw --json list`
- To see history for one site: `siteclaw --json history <site>`
- To find shared issues across sites: `siteclaw --json correlate`
```

## Testing

`pnpm test` runs the Vitest suite (`tests/`), covering the SQLite layer, the site-list loader, the config loader, and the cross-site correlation logic. Lighthouse itself is not mocked or covered by automated tests — it requires a real headless Chrome and a real network call, so it's verified manually via `siteclaw check` against a real URL instead.

## Tech Stack

TypeScript/Node, [`lighthouse`](https://www.npmjs.com/package/lighthouse) + `chrome-launcher` for measurement, `better-sqlite3` for storage, `commander` for the CLI, `vitest` for tests, `biome` for lint/format, `pnpm` as package manager.

## Related

- 🦀 [Dietclaw](https://github.com/psandis/dietclaw) — Codebase health monitor
- 🦀 [Dustclaw](https://github.com/psandis/dustclaw) — Find out what is eating your disk space
- 🦀 [Driftclaw](https://github.com/psandis/driftclaw) — Deployment drift detection across environments
- 🦀 [Feedclaw](https://github.com/psandis/feedclaw) — RSS/Atom feed reader and AI digest builder
- 🦀 [OpenClaw](https://github.com/openclaw/openclaw) — The open claw ecosystem

## License

See [MIT](LICENSE)

