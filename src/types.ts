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
}

// From Lighthouse's best-practices category (is-on-https, has-hsts, csp-xss, deprecations).
// audit.score === 1 is a pass; these booleans/counts are read directly off that, not inferred.
export interface SecurityFindings {
  onHttps: boolean;
  hasHsts: boolean;
  hasCspAgainstXss: boolean;
  deprecatedApiUsages: string[];
}

export interface LighthouseResult {
  performanceScore: number;
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
  coreMetrics: CoreMetrics;
  renderBlockingResources: RenderBlockingResource[];
  opportunities: Opportunity[];
  diagnostics: Diagnostics;
  security: SecurityFindings;
  note: string | null;
}
