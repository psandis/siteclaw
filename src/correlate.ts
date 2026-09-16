import type { Run } from "./types.js";

// The differentiator over plain per-site Lighthouse tooling: given the latest run for each
// site in the portfolio, find render-blocking resource URLs that show up on more than one
// site (e.g. a shared theme/plugin asset), so a fix can be traced back to one root cause
// instead of investigated separately per site.
export function findSharedRenderBlockingResources(runs: Run[]): Map<string, string[]> {
  const byUrl = new Map<string, string[]>();
  for (const run of runs) {
    for (const resource of run.renderBlockingResources) {
      const sites = byUrl.get(resource.url) ?? [];
      sites.push(run.siteName);
      byUrl.set(resource.url, sites);
    }
  }
  const shared = new Map<string, string[]>();
  for (const [url, sites] of byUrl) {
    if (sites.length > 1) shared.set(url, sites);
  }
  return shared;
}
