import { existsSync, readFileSync } from "node:fs";

// Everything the rest of the app treats as configurable rather than hardcoded, so a different
// user of this tool can change storage location, site-list location, and which Lighthouse
// audits get surfaced, without editing source.
export interface SiteclawConfig {
  dbPath: string;
  sitesPath: string;
  opportunityAudits: string[];
}

const DEFAULT_CONFIG: SiteclawConfig = {
  dbPath: "siteclaw.db",
  sitesPath: "sites.json",
  opportunityAudits: [
    "uses-optimized-images",
    "unused-css-rules",
    "unused-javascript",
    "total-byte-weight",
  ],
};

// A missing config file is not an error: it just means "use the defaults," so the tool
// works out of the box with zero setup and only needs siteclaw.config.json for overrides.
export function loadConfig(path = "siteclaw.config.json"): SiteclawConfig {
  if (!existsSync(path)) {
    return DEFAULT_CONFIG;
  }
  const overrides = JSON.parse(readFileSync(path, "utf-8"));
  return { ...DEFAULT_CONFIG, ...overrides };
}
