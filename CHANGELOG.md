# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [Semantic Versioning](https://semver.org/).

## [0.2.1] - not yet published

### Added
- Diagnostics: server response time (TTFB), unnecessary legacy JavaScript (old-browser polyfills/transforms), duplicated JavaScript modules, and count of requests still on HTTP/1.1 instead of HTTP/2+.
- `--device <mobile|desktop|both>` on `check` — Lighthouse's two real device presets, run and reported separately (or both at once). History/comparison is scoped per device.

## [0.2.0] - published to npm

### Added
- `check` now reports all six Lighthouse performance metrics (First Contentful Paint, Largest Contentful Paint, Speed Index, Time to Interactive, Total Blocking Time, Cumulative Layout Shift), rated good/needs improvement/poor against Google's published Core Web Vitals thresholds.
- Diagnostics section: DOM element count, network request count and transfer size, named third-party origin impact (main-thread time, transfer size).
- Security checks: HTTPS, HSTS header, and CSP-against-XSS, from Lighthouse's `best-practices` category run alongside `performance`.
- `check` shows a comparison against the site's own immediately preceding run (score and LCP delta), skipping the metric diff rather than showing a misleading number when the previous run predates this schema.
- `check` now accepts a bare domain (`www.example.com`) in addition to a full URL or a configured site name.
- Opportunity output includes Lighthouse's full fix description, not just the audit title.
- CLI errors print a clean message and exit 1 instead of a raw Node stack trace.
- `--json` flag on all commands.
- MIT `LICENSE`.

### Changed
- README restructured to match the openclaw family layout (What It Does / Requirements / Install / Quick Start / CLI / Configuration / Agent Integration / Testing / Tech Stack / Related / License), with real captured command output throughout.

## [0.1.1] - published to npm

### Fixed
- The published npm package shipped raw `src/`/`tests/` TypeScript instead of the compiled `dist/`, so the installed `siteclaw` binary didn't exist. Added a `files` field and a `prepublishOnly` build step.

## [0.1.0] - published to npm

### Added
- Initial CLI: `check`, `list`, `history`, `correlate`, backed by Lighthouse and a local SQLite history store.
- `sites.json` for the tracked site portfolio, `siteclaw.config.json` for `dbPath`/`sitesPath`/`opportunityAudits` overrides.
