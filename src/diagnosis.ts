import { rate } from "./ratings.js";
import type { LighthouseResult } from "./types.js";

// General industry research on the relationship between load-time delay and business
// outcomes. These are published findings about web performance in general, not a prediction
// of this specific site's numbers — cited so the report's severity claims are traceable
// rather than asserted, and clearly framed as general context rather than a per-site forecast.
// Sources: Google/Akamai-SOASTA (100ms delay ~7% conversion drop; 1s delay in e-commerce up to
// 20% conversion drop), Deloitte/Google 2020 mobile speed study (0.1s improvement ~10% more
// retail spend), industry bounce-rate data (1-3s load ~32% higher bounce; 53% of mobile users
// abandon a site taking over 3s to load).
const RESEARCH_CONTEXT =
  "Published research on web performance generally (not a claim about this specific site): " +
  "a 100ms delay has been linked to roughly a 7% drop in conversions, a 1-second delay on " +
  "e-commerce pages to up to a 20% drop, and sites taking over 3 seconds to load see roughly " +
  "53% of mobile visitors abandon before it finishes (Google/Akamai-SOASTA; Deloitte/Google 2020).";

// Priority order follows the practitioner consensus that server response time "sets the
// ceiling" for every other metric — fixing a slow TTFB is the first thing worth doing,
// because no client-side optimization can compensate for a server that responds slowly.
// After that: the metric the aggregate score is most sensitive to (TBT, weighted 30% in
// Lighthouse's own scoring), then LCP (25% weight), then everything else.
export function buildDiagnosis(result: LighthouseResult): string {
  const { coreMetrics, diagnostics, security } = result;
  const ttfbRating = rate("ttfb", diagnostics.serverResponseTimeMs);
  const tbtRating = rate("tbt", coreMetrics.tbt);
  const lcpRating = rate("lcp", coreMetrics.lcp);

  const lines: string[] = [];

  if (ttfbRating === "poor" || ttfbRating === "needs improvement") {
    lines.push(
      `Root cause likely server-side: TTFB is ${Math.round(diagnostics.serverResponseTimeMs)}ms (${ttfbRating}). ` +
        "This delays every other metric before the browser can even start rendering — fix hosting/server response time first; no front-end change will fix a slow server.",
    );
  } else if (tbtRating === "poor" && diagnostics.thirdParty.length > 0) {
    const top = diagnostics.thirdParty[0];
    lines.push(
      `Root cause likely third-party scripts: Total Blocking Time is ${Math.round(coreMetrics.tbt)}ms (${tbtRating}), and ${top.entity} alone accounts for ${Math.round(top.blockingMs)}ms of main-thread blocking. TBT is weighted most heavily (30%) in Lighthouse's score, so this is the highest-leverage fix.`,
    );
  } else if (lcpRating === "poor" || lcpRating === "needs improvement") {
    lines.push(
      `Largest Contentful Paint is ${Math.round(coreMetrics.lcp)}ms (${lcpRating}) with a fast server (TTFB ${Math.round(diagnostics.serverResponseTimeMs)}ms) — the delay is happening client-side after the server has already responded. Check for a slow-loading render-blocking resource, redirect, or content waiting on a client-side request.`,
    );
  } else {
    lines.push("No single dominant bottleneck: server response, main-thread work, and LCP are all in the good/acceptable range.");
  }

  if (!security.onHttps) {
    lines.push("Also: this site is not served over HTTPS, which is both a security and a Lighthouse best-practices failure.");
  }

  const anyPoor = [ttfbRating, tbtRating, lcpRating].includes("poor");
  if (anyPoor) {
    lines.push(RESEARCH_CONTEXT);
  }

  return lines.join(" ");
}
