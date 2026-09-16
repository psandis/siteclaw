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

export interface LighthouseResult {
  performanceScore: number;
  renderBlockingResources: RenderBlockingResource[];
  opportunities: Opportunity[];
}

export interface Run {
  id: number;
  siteName: string;
  url: string;
  timestamp: string;
  performanceScore: number;
  renderBlockingResources: RenderBlockingResource[];
  opportunities: Opportunity[];
  note: string | null;
}
