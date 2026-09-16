# Siteclaw

[![npm version](https://img.shields.io/npm/v/siteclaw.svg?style=flat-square)](https://www.npmjs.com/package/siteclaw)

Lighthouse-backed performance history tracker for a portfolio of client sites. See which sites are slow, why, and whether several sites share the same root cause. Works standalone or as an OpenClaw skill.

## What It Does

- runs Lighthouse against any site (by name from `sites.json`, or a raw URL for a one-off check) and stores the result
- tracks performance score history per site, with a trend indicator against the previous run
- surfaces Lighthouse's own fix guidance: render-blocking resources, unused CSS/JS, oversized payloads
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

Running Lighthouse against https://techcrunch.com...

techcrunch: performance score 46

Core metrics:
  First Contentful Paint: 2280ms (needs improvement)
  Largest Contentful Paint: 4249ms (poor)
  Speed Index: 10955ms (poor)
  Time to Interactive: 33394ms (poor)
  Total Blocking Time: 1824ms (poor)
  Cumulative Layout Shift: 0.064 (good)

Opportunities:
  Reduce unused CSS: Reduce unused rules from stylesheets and defer CSS not used for above-the-fold content to decrease bytes consumed by network activity. [Learn how to reduce unused CSS](https://developer.chrome.com/docs/lighthouse/performance/unused-css-rules/). (160ms potential savings)
  Reduce unused JavaScript: Reduce unused JavaScript and defer loading scripts until they are required to decrease bytes consumed by network activity. [Learn how to reduce unused JavaScript](https://developer.chrome.com/docs/lighthouse/performance/unused-javascript/). (160ms potential savings)
  Avoid enormous network payloads: Large network payloads cost users real money and are highly correlated with long load times. [Learn how to reduce payload sizes](https://developer.chrome.com/docs/lighthouse/performance/total-byte-weight/).

Diagnostics:
  DOM elements: 7146
  Network requests: 246 (4.0MB transferred)
  Third-party impact (main-thread time):
    Google Tag Manager: 188ms, 521.5KB
    servenobid.com: 124ms, 438.2KB
    Google CDN: 104ms, 346.1KB
    Facebook: 95ms, 189.9KB
    Google/Doubleclick Ads: 67ms, 269.9KB

Security:
  HTTPS: yes
  HSTS header: present
  CSP against XSS: configured

Vs. previous check (2026-09-16T22:09:31.502Z): score up 12, LCP -25629ms
```

Notes:

- accepts either a name from `sites.json`, a bare domain (`www.example.com`), or a full `http(s)://` URL — no `sites.json` entry required for the latter two
- `--note <text>` attaches a note to the run, useful for tracing a later regression back to a specific change
- Core metric ratings (good / needs improvement / poor) use Google's own published Core Web Vitals / Lighthouse thresholds
- Third-party impact and security checks (HTTPS, HSTS, CSP) come from Lighthouse's `best-practices` category, run alongside `performance`
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
version: 0.2.0
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

