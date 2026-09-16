import { describe, expect, it } from "vitest";
import { buildDiagnosis } from "../src/diagnosis.js";
import type { LighthouseResult } from "../src/types.js";

function makeResult(overrides: Partial<LighthouseResult> = {}): LighthouseResult {
  return {
    performanceScore: 90,
    device: "mobile",
    coreMetrics: { fcp: 1000, lcp: 1500, speedIndex: 1500, tti: 2000, tbt: 50, cls: 0.02 },
    renderBlockingResources: [],
    opportunities: [],
    diagnostics: {
      domElementCount: 500,
      totalRequests: 20,
      totalTransferBytes: 500_000,
      thirdParty: [],
      serverResponseTimeMs: 200,
      legacyJavascriptWastedBytes: 0,
      duplicatedJavascriptWastedBytes: 0,
      legacyHttpRequestCount: 0,
    },
    security: { onHttps: true, hasHsts: true, hasCspAgainstXss: true, deprecatedApiUsages: [] },
    ...overrides,
  };
}

describe("buildDiagnosis", () => {
  it("blames a slow server first when TTFB is poor, even if other metrics are also bad", () => {
    const result = makeResult({
      diagnostics: {
        ...makeResult().diagnostics,
        serverResponseTimeMs: 2500,
      },
      coreMetrics: { fcp: 5000, lcp: 6000, speedIndex: 5000, tti: 7000, tbt: 700, cls: 0.02 },
    });
    expect(buildDiagnosis(result)).toMatch(/Root cause likely server-side/);
    expect(buildDiagnosis(result)).toMatch(/2500ms/);
  });

  it("blames third-party scripts when TBT is poor and a heavy third party exists, with fast TTFB", () => {
    const result = makeResult({
      coreMetrics: { fcp: 1000, lcp: 1500, speedIndex: 1500, tti: 2000, tbt: 700, cls: 0.02 },
      diagnostics: {
        ...makeResult().diagnostics,
        thirdParty: [{ entity: "Ad Network", blockingMs: 500, transferBytes: 100_000 }],
      },
    });
    expect(buildDiagnosis(result)).toMatch(/Root cause likely third-party scripts/);
    expect(buildDiagnosis(result)).toMatch(/Ad Network/);
  });

  it("flags a client-side LCP delay when the server itself is fast", () => {
    const result = makeResult({
      coreMetrics: { fcp: 1000, lcp: 5000, speedIndex: 1500, tti: 2000, tbt: 50, cls: 0.02 },
    });
    expect(buildDiagnosis(result)).toMatch(/happening client-side/);
  });

  it("reports no dominant bottleneck when everything is in good range", () => {
    expect(buildDiagnosis(makeResult())).toMatch(/No single dominant bottleneck/);
  });

  it("calls out missing HTTPS regardless of the performance diagnosis", () => {
    const result = makeResult({ security: { onHttps: false, hasHsts: false, hasCspAgainstXss: false, deprecatedApiUsages: [] } });
    expect(buildDiagnosis(result)).toMatch(/not served over HTTPS/);
  });

  it("only appends the research context when something is genuinely poor", () => {
    expect(buildDiagnosis(makeResult())).not.toMatch(/Published research/);
    const poorResult = makeResult({ diagnostics: { ...makeResult().diagnostics, serverResponseTimeMs: 2500 } });
    expect(buildDiagnosis(poorResult)).toMatch(/Published research/);
  });
});
