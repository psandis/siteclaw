import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import type { LighthouseResult, Opportunity, RenderBlockingResource } from "./types.js";

// Lighthouse audits a page by driving a real (headless) Chrome instance, so it needs its own
// browser to launch and control on a local debugging port. This is black-box only: no server
// access to `url` is used or required.
//
// `opportunityAudits` is caller-supplied (from siteclaw.config.json) rather than hardcoded here,
// so which audits get surfaced can change without touching this file.
export async function runLighthouse(url: string, opportunityAudits: string[]): Promise<LighthouseResult> {
  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless"] });
  try {
    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      onlyCategories: ["performance"],
    });

    if (!runnerResult) {
      throw new Error(`Lighthouse produced no result for ${url}`);
    }

    const lhr = runnerResult.lhr;
    // Lighthouse scores are 0-1; the rest of the app works in the familiar 0-100 form.
    const performanceScore = Math.round((lhr.categories.performance?.score ?? 0) * 100);

    // Render-blocking resources are tracked separately from the configurable opportunity list
    // below because they're central to the tool's cross-site correlation feature.
    const renderBlockingResources: RenderBlockingResource[] = (
      lhr.audits["render-blocking-resources"]?.details as any
    )?.items?.map((item: any) => ({
      url: item.url,
      wastedMs: item.wastedMs ?? 0,
    })) ?? [];

    // A Lighthouse audit with score < 1 means there's room for improvement; a null score
    // means the audit doesn't apply to this page (not a failure), so it's excluded, not flagged.
    const opportunities: Opportunity[] = opportunityAudits
      .map((id) => lhr.audits[id])
      .filter((audit) => audit && audit.score !== null && audit.score < 1)
      .map((audit) => ({
        auditId: audit.id,
        title: audit.title,
        description: audit.description,
        wastedBytes: (audit.details as any)?.overallSavingsBytes ?? null,
        wastedMs: (audit.details as any)?.overallSavingsMs ?? null,
      }));

    return { performanceScore, renderBlockingResources, opportunities };
  } finally {
    // Always kill the launched Chrome instance, even if Lighthouse throws, to avoid leaking
    // headless Chrome processes on every failed run.
    await chrome.kill();
  }
}
