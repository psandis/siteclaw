#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { findSharedRenderBlockingResources } from "./correlate.js";
import { getHistoryForSite, getLatestRunPerSite, insertRun, openDb } from "./db.js";
import { runLighthouse } from "./lighthouse-runner.js";
import { findSite, loadSites } from "./sites.js";
import type { Run } from "./types.js";

// Config is loaded once at startup; every command below reads paths/audit list from it
// instead of hardcoding "siteclaw.db"/"sites.json" directly.
const config = loadConfig();

const program = new Command();
program.name("siteclaw").description("Track Lighthouse performance history across client sites");

// Compares the two most recent runs only, not the full history, so a single new `check`
// tells you whether the last change helped or hurt.
function trendArrow(runs: Run[]): string {
  if (runs.length < 2) return "-";
  const diff = runs[runs.length - 1].performanceScore - runs[runs.length - 2].performanceScore;
  if (diff > 0) return `up ${diff}`;
  if (diff < 0) return `down ${Math.abs(diff)}`;
  return "flat";
}

program
  .command("check <site>")
  .description("Run Lighthouse against a configured site and store the result")
  .option("--note <text>", "attach a note to this run (e.g. a deploy or change made)")
  .action(async (siteName: string, opts: { note?: string }) => {
    const site = findSite(loadSites(config.sitesPath), siteName);
    console.log(`Running Lighthouse against ${site.url}...`);
    const result = await runLighthouse(site.url, config.opportunityAudits);
    const db = openDb(config.dbPath);
    insertRun(db, site.name, site.url, result, opts.note ?? null);
    db.close();

    console.log(`\n${site.name}: performance score ${result.performanceScore}`);
    if (result.renderBlockingResources.length > 0) {
      console.log("\nRender-blocking resources:");
      for (const r of result.renderBlockingResources) {
        console.log(`  ${r.url} (${r.wastedMs}ms)`);
      }
    }
    if (result.opportunities.length > 0) {
      console.log("\nOpportunities:");
      for (const o of result.opportunities) {
        console.log(`  ${o.title}${o.wastedMs ? ` (${o.wastedMs}ms potential savings)` : ""}`);
      }
    }
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
    if (shared.size === 0) {
      console.log("No shared render-blocking resources found across sites.");
      return;
    }
    console.log("Shared render-blocking resources:");
    for (const [url, sites] of shared) {
      console.log(`  ${url} -> affects: ${sites.join(", ")}`);
    }
  });

program.parse();
