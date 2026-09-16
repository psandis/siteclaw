import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
// Lighthouse's own shipped desktop preset (formFactor, throttling, screen emulation, UA) —
// not reconstructed here, since that would risk drifting from Lighthouse's real defaults.
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import type {
  CoreMetrics,
  Device,
  Diagnostics,
  LighthouseResult,
  Opportunity,
  RenderBlockingResource,
  SecurityFindings,
  ThirdPartyImpact,
} from "./types.js";

function sumWastedBytes(items: any[]): number {
  return items.reduce((sum, item) => sum + (item.wastedBytes ?? 0), 0);
}

// Lighthouse audits a page by driving a real (headless) Chrome instance, so it needs its own
// browser to launch and control on a local debugging port. This is black-box only: no server
// access to `url` is used or required.
//
// `opportunityAudits` is caller-supplied (from siteclaw.config.json) rather than hardcoded here,
// so which audits get surfaced can change without touching this file.
//
// best-practices is included alongside performance (not performance alone) specifically to get
// real security-relevant audits (is-on-https, has-hsts, csp-xss, deprecations) computed at all —
// they don't run if only the performance category is requested.
export async function runLighthouse(
  url: string,
  opportunityAudits: string[],
  device: Device = "mobile",
): Promise<LighthouseResult> {
  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless"] });
  try {
    const runnerResult = await lighthouse(
      url,
      { port: chrome.port, output: "json", onlyCategories: ["performance", "best-practices"] },
      device === "desktop" ? (desktopConfig as any) : undefined,
    );

    if (!runnerResult) {
      throw new Error(`Lighthouse produced no result for ${url}`);
    }

    const lhr = runnerResult.lhr;
    // Lighthouse scores are 0-1; the rest of the app works in the familiar 0-100 form.
    const performanceScore = Math.round((lhr.categories.performance?.score ?? 0) * 100);

    // Lighthouse's six underlying performance metrics, in their native units. These are the
    // real numbers the 0-100 score is computed from, surfaced directly rather than only as
    // one aggregate score.
    const coreMetrics: CoreMetrics = {
      fcp: lhr.audits["first-contentful-paint"]?.numericValue ?? 0,
      lcp: lhr.audits["largest-contentful-paint"]?.numericValue ?? 0,
      speedIndex: lhr.audits["speed-index"]?.numericValue ?? 0,
      tti: lhr.audits.interactive?.numericValue ?? 0,
      tbt: lhr.audits["total-blocking-time"]?.numericValue ?? 0,
      cls: lhr.audits["cumulative-layout-shift"]?.numericValue ?? 0,
    };

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

    // network-requests lists one row per request (not pre-aggregated), so totals are summed
    // here. third-parties-insight (replaces the removed third-party-summary audit) gives
    // per-origin main-thread blocking time and transfer size directly.
    const requestItems: any[] = (lhr.audits["network-requests"]?.details as any)?.items ?? [];
    const totalRequests = requestItems.length;
    const totalTransferBytes = requestItems.reduce((sum, r) => sum + (r.transferSize ?? 0), 0);

    const thirdPartyItems: any[] = (lhr.audits["third-parties-insight"]?.details as any)?.items ?? [];
    const thirdParty: ThirdPartyImpact[] = thirdPartyItems
      .map((item) => ({
        entity: typeof item.entity === "string" ? item.entity : String(item.entity),
        blockingMs: item.mainThreadTime ?? 0,
        transferBytes: item.transferSize ?? 0,
      }))
      .slice(0, 5);

    // legacy-javascript-insight/duplicated-javascript-insight report per-file wasted bytes with
    // no pre-summed total, so it's summed here. modern-http-insight lists requests still on
    // HTTP/1.1 instead of HTTP/2+, one row per request — the count itself is the finding.
    const legacyJsItems: any[] = (lhr.audits["legacy-javascript-insight"]?.details as any)?.items ?? [];
    const duplicatedJsItems: any[] = (lhr.audits["duplicated-javascript-insight"]?.details as any)?.items ?? [];
    const legacyHttpItems: any[] = (lhr.audits["modern-http-insight"]?.details as any)?.items ?? [];

    const diagnostics: Diagnostics = {
      domElementCount: lhr.audits["dom-size-insight"]?.numericValue ?? 0,
      totalRequests,
      totalTransferBytes,
      thirdParty,
      serverResponseTimeMs: lhr.audits["server-response-time"]?.numericValue ?? 0,
      legacyJavascriptWastedBytes: sumWastedBytes(legacyJsItems),
      duplicatedJavascriptWastedBytes: sumWastedBytes(duplicatedJsItems),
      legacyHttpRequestCount: legacyHttpItems.length,
    };

    // best-practices audits: score === 1 is a pass, 0 is a fail, null means not applicable
    // to this page. Treated as a pass when not applicable, since there's nothing to flag.
    const passes = (id: string) => lhr.audits[id]?.score !== 0;
    const deprecationsAudit = lhr.audits.deprecations;
    const deprecatedApiUsages: string[] =
      (deprecationsAudit?.details as any)?.items?.map((item: any) => item.value ?? String(item)) ?? [];

    const security: SecurityFindings = {
      onHttps: passes("is-on-https"),
      hasHsts: passes("has-hsts"),
      hasCspAgainstXss: passes("csp-xss"),
      deprecatedApiUsages,
    };

    return { performanceScore, device, coreMetrics, renderBlockingResources, opportunities, diagnostics, security };
  } finally {
    // Always kill the launched Chrome instance, even if Lighthouse throws, to avoid leaking
    // headless Chrome processes on every failed run.
    await chrome.kill();
  }
}
