#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { findSharedRenderBlockingResources } from "./correlate.js";
import { getHistoryForSite, getLatestRunPerSite, insertRun, openDb } from "./db.js";
import { runLighthouse } from "./lighthouse-runner.js";
import { rate } from "./ratings.js";
import { loadSites, resolveSiteOrUrl } from "./sites.js";
import type { CoreMetrics, Diagnostics, Run, SecurityFindings } from "./types.js";

// Config is loaded once at startup; every command below reads paths/audit list from it
// instead of hardcoding "siteclaw.db"/"sites.json" directly.
const config = loadConfig();

const program = new Command();
program
  .name("siteclaw")
  .description("Track Lighthouse performance history across client sites")
  .version("0.1.3")
  .option("--json", "Output as JSON");

// Commander only prints command usage by default; this adds the setup steps a first-time
// user actually needs (sites.json, siteclaw.config.json) so `siteclaw --help` alone is enough
// to get started, without requiring a trip to the README.
program.addHelpText(
  "after",
  `
Setup (only needed for named sites; a raw URL works with no setup at all):
  1. Create sites.json in the current directory, an array of sites to track:
       [{ "name": "client-a", "url": "https://client-a-domain.com" }]
  2. (Optional) Create siteclaw.config.json to override defaults (dbPath, sitesPath,
     opportunityAudits). If missing, built-in defaults are used.

Typical workflow:
  $ siteclaw check client-a --note "deployed plugin update"
  $ siteclaw check https://example.com          # one-off check, no sites.json entry needed
  $ siteclaw list
  $ siteclaw history client-a
  $ siteclaw correlate

(Running from this project directory instead of a global install? Use "pnpm dev" in place
of "siteclaw" above.)

Results are stored in a local SQLite database (siteclaw.db by default) and accumulate
over time; nothing is sent anywhere, and no site is written to.
`,
);

// Compares the two most recent runs only, not the full history, so a single new `check`
// tells you whether the last change helped or hurt.
function trendArrow(runs: Run[]): string {
  if (runs.length < 2) return "-";
  const diff = runs[runs.length - 1].performanceScore - runs[runs.length - 2].performanceScore;
  if (diff > 0) return `up ${diff}`;
  if (diff < 0) return `down ${Math.abs(diff)}`;
  return "flat";
}

const METRIC_LABELS: Record<keyof CoreMetrics, string> = {
  fcp: "First Contentful Paint",
  lcp: "Largest Contentful Paint",
  speedIndex: "Speed Index",
  tti: "Time to Interactive",
  tbt: "Total Blocking Time",
  cls: "Cumulative Layout Shift",
};

function formatMetric(metric: keyof CoreMetrics, value: number): string {
  const formatted = metric === "cls" ? value.toFixed(3) : `${Math.round(value)}ms`;
  return `${METRIC_LABELS[metric]}: ${formatted} (${rate(metric, value)})`;
}

function printCoreMetrics(coreMetrics: CoreMetrics): void {
  console.log("\nCore metrics:");
  for (const metric of Object.keys(METRIC_LABELS) as (keyof CoreMetrics)[]) {
    console.log(`  ${formatMetric(metric, coreMetrics[metric])}`);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function printDiagnostics(diagnostics: Diagnostics): void {
  console.log("\nDiagnostics:");
  console.log(`  DOM elements: ${diagnostics.domElementCount}`);
  console.log(`  Network requests: ${diagnostics.totalRequests} (${formatBytes(diagnostics.totalTransferBytes)} transferred)`);
  if (diagnostics.thirdParty.length > 0) {
    console.log("  Third-party impact (main-thread time):");
    for (const tp of diagnostics.thirdParty) {
      console.log(`    ${tp.entity}: ${Math.round(tp.blockingMs)}ms, ${formatBytes(tp.transferBytes)}`);
    }
  }
}

function printSecurity(security: SecurityFindings): void {
  console.log("\nSecurity:");
  console.log(`  HTTPS: ${security.onHttps ? "yes" : "NO — site is not served over HTTPS"}`);
  console.log(`  HSTS header: ${security.hasHsts ? "present" : "missing"}`);
  console.log(`  CSP against XSS: ${security.hasCspAgainstXss ? "configured" : "missing or weak"}`);
  if (security.deprecatedApiUsages.length > 0) {
    console.log(`  Deprecated/soon-to-be-removed API usage (${security.deprecatedApiUsages.length}):`);
    for (const usage of security.deprecatedApiUsages) {
      console.log(`    ${usage}`);
    }
  }
}

// A one-line summary comparing this run to the site's own immediately preceding run, so a
// regression or improvement is visible at the moment of `check` rather than only via `history`.
function printComparisonToPrevious(history: Run[]): void {
  if (history.length < 2) return;
  const [previous, current] = history.slice(-2);
  const scoreDiff = current.performanceScore - previous.performanceScore;
  const direction = scoreDiff > 0 ? "up" : scoreDiff < 0 ? "down" : "unchanged";

  // A real page load never has an LCP of exactly 0ms, so lcp === 0 reliably means this row
  // predates the core-metrics column (db.ts's EMPTY_CORE_METRICS fallback) rather than a
  // genuine measurement. Showing a diff against that placeholder would be a fabricated number,
  // so the metric comparison is skipped rather than printed misleadingly.
  const hasRealMetrics = previous.coreMetrics.lcp !== 0 && current.coreMetrics.lcp !== 0;
  const lcpPart = hasRealMetrics
    ? `, LCP ${current.coreMetrics.lcp - previous.coreMetrics.lcp >= 0 ? "+" : ""}${Math.round(current.coreMetrics.lcp - previous.coreMetrics.lcp)}ms`
    : " (LCP comparison unavailable: previous check predates core metrics tracking)";

  console.log(`\nVs. previous check (${previous.timestamp}): score ${direction} ${Math.abs(scoreDiff)}${lcpPart}`);
}

program
  .command("check <siteOrUrl>")
  .description(
    "Run Lighthouse against a site (by name from sites.json, a bare domain, or a full http(s) URL) and store the result",
  )
  .option("--note <text>", "attach a note to this run (e.g. a deploy or change made)")
  .action(async (siteOrUrl: string, opts: { note?: string }) => {
    // Resolves a configured site name first, then falls back to treating the input as a
    // one-off URL/domain (no sites.json entry required) — see resolveSiteOrUrl for the
    // exact matching rules.
    const site = resolveSiteOrUrl(siteOrUrl, config.sitesPath);

    const isJson = program.opts().json;
    if (!isJson) console.log(`Running Lighthouse against ${site.url}...`);
    const result = await runLighthouse(site.url, config.opportunityAudits);
    const db = openDb(config.dbPath);
    insertRun(db, site.name, site.url, result, opts.note ?? null);
    const history = getHistoryForSite(db, site.name);
    db.close();

    if (isJson) {
      console.log(JSON.stringify({ site: site.name, url: site.url, note: opts.note ?? null, ...result }, null, 2));
      return;
    }

    console.log(`\n${site.name}: performance score ${result.performanceScore}`);
    printCoreMetrics(result.coreMetrics);
    if (result.renderBlockingResources.length > 0) {
      console.log("\nRender-blocking resources:");
      for (const r of result.renderBlockingResources) {
        console.log(`  ${r.url} (${r.wastedMs}ms)`);
      }
    }
    if (result.opportunities.length > 0) {
      console.log("\nOpportunities:");
      for (const o of result.opportunities) {
        console.log(`  ${o.title}: ${o.description}${o.wastedMs ? ` (${o.wastedMs}ms potential savings)` : ""}`);
      }
    }
    printDiagnostics(result.diagnostics);
    printSecurity(result.security);
    printComparisonToPrevious(history);
  });

program
  .command("list")
  .description("Show the latest score for every site currently in sites.json")
  .action(() => {
    // The database keeps every run ever recorded, including for sites later removed from
    // sites.json. Filtering by the current site list here keeps `list` showing only what's
    // actively tracked, without deleting the historical rows.
    const configuredNames = new Set(loadSites(config.sitesPath).map((s) => s.name));
    const db = openDb(config.dbPath);
    const latest = getLatestRunPerSite(db).filter((run) => configuredNames.has(run.siteName));
    db.close();

    if (program.opts().json) {
      console.log(JSON.stringify(latest, null, 2));
      return;
    }

    if (latest.length === 0) {
      console.log("No runs recorded yet. Use `siteclaw check <site>` first.");
      return;
    }
    for (const run of latest) {
      console.log(`${run.siteName}\t${run.performanceScore}\t${run.timestamp}`);
    }
  });

program
  .command("history <site>")
  .description("Show score history for one site")
  .action((siteName: string) => {
    const db = openDb(config.dbPath);
    const runs = getHistoryForSite(db, siteName);
    db.close();

    if (program.opts().json) {
      console.log(JSON.stringify({ site: siteName, runs, trend: trendArrow(runs) }, null, 2));
      return;
    }

    if (runs.length === 0) {
      console.log(`No runs recorded yet for "${siteName}".`);
      return;
    }
    for (const run of runs) {
      const note = run.note ? ` note: ${run.note}` : "";
      console.log(`${run.timestamp}\t${run.performanceScore}${note}`);
    }
    console.log(`\nTrend: ${trendArrow(runs)}`);
  });

program
  .command("correlate")
  .description("Find shared issues across the latest run of every site currently in sites.json")
  .action(() => {
    const configuredNames = new Set(loadSites(config.sitesPath).map((s) => s.name));
    const db = openDb(config.dbPath);
    const latest = getLatestRunPerSite(db).filter((run) => configuredNames.has(run.siteName));
    db.close();

    const shared = findSharedRenderBlockingResources(latest);

    if (program.opts().json) {
      console.log(JSON.stringify({ shared: [...shared.entries()].map(([url, sites]) => ({ url, sites })) }, null, 2));
      return;
    }

    if (shared.size === 0) {
      console.log("No shared render-blocking resources found across sites.");
      return;
    }
    console.log("Shared render-blocking resources:");
    for (const [url, sites] of shared) {
      console.log(`  ${url} -> affects: ${sites.join(", ")}`);
    }
  });

// Commander exits with code 1 by default when no subcommand is given, which makes a bare
// `siteclaw`/`pnpm dev` look like a failure to npm/pnpm even though showing help isn't an error.
if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

// Command actions (some async) can throw for expected user errors — an unregistered site
// name, a malformed sites.json — which would otherwise surface as a raw Node stack trace.
// This prints just the message and exits 1, the way a CLI's errors should look.
process.on("unhandledRejection", (err: any) => {
  console.error(`Error: ${err.message ?? err}`);
  process.exit(1);
});

try {
  program.parse();
} catch (err: any) {
  console.error(`Error: ${err.message ?? err}`);
  process.exit(1);
}
