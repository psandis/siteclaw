export interface SiteEntry {
  name: string;
  url: string;
}

export interface RenderBlockingResource {
  url: string;
  wastedMs: number;
}

export interface Opportunity {
  auditId: string;
  title: string;
  description: string;
  wastedBytes: number | null;
  wastedMs: number | null;
}

// Lighthouse's six performance metrics, in their native units (ms, except cls which is
// unitless). Rating thresholds are Google's own published Core Web Vitals / Lighthouse
// scoring boundaries, not invented here.
export interface CoreMetrics {
  fcp: number;
  lcp: number;
  speedIndex: number;
  tti: number;
  tbt: number;
  cls: number;
}

// A single third-party origin's impact, from Lighthouse's own third-party-summary audit.
export interface ThirdPartyImpact {
  entity: string;
  blockingMs: number;
  transferBytes: number;
}

export interface Diagnostics {
  domElementCount: number;
  totalRequests: number;
  totalTransferBytes: number;
  thirdParty: ThirdPartyImpact[];
  // Server response time (TTFB), in ms — from Lighthouse's server-response-time audit.
  // Distinguishes "the page is slow because the server took long to respond" from
  // "the page is slow because of client-side script/render work" (FCP/LCP alone can't).
  serverResponseTimeMs: number;
  // Wasted bytes from shipping unnecessary legacy JS transforms/polyfills for old browsers.
  legacyJavascriptWastedBytes: number;
  // Wasted bytes from the same JS module being bundled/downloaded more than once.
  duplicatedJavascriptWastedBytes: number;
  // Count of requests still made over HTTP/1.1 instead of HTTP/2 or HTTP/3.
  legacyHttpRequestCount: number;
}

// From Lighthouse's best-practices category (is-on-https, has-hsts, csp-xss, deprecations).
// audit.score === 1 is a pass; these booleans/counts are read directly off that, not inferred.
export interface SecurityFindings {
  onHttps: boolean;
  hasHsts: boolean;
  hasCspAgainstXss: boolean;
  deprecatedApiUsages: string[];
}

// Lighthouse ships exactly two device presets — mobile (throttled 4G, MotoG4 emulation,
// the default) and desktop (untethered, 1350x940). There is no built-in "tablet" preset.
export type Device = "mobile" | "desktop";

export interface LighthouseResult {
  performanceScore: number;
  device: Device;
  coreMetrics: CoreMetrics;
  renderBlockingResources: RenderBlockingResource[];
  opportunities: Opportunity[];
  diagnostics: Diagnostics;
  security: SecurityFindings;
}

export interface Run {
  id: number;
  siteName: string;
  url: string;
  timestamp: string;
  performanceScore: number;
  device: Device;
  coreMetrics: CoreMetrics;
  renderBlockingResources: RenderBlockingResource[];
  opportunities: Opportunity[];
  diagnostics: Diagnostics;
  security: SecurityFindings;
  note: string | null;
}
