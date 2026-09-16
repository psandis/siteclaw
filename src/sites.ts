import { readFileSync } from "node:fs";
import type { SiteEntry } from "./types.js";

// The portfolio of sites to track lives in a plain JSON data file, not in code, so adding
// or removing a client site never requires a code change or rebuild.
export function loadSites(path = "sites.json"): SiteEntry[] {
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON array of {name, url} entries`);
  }
  return parsed;
}

export function findSite(sites: SiteEntry[], name: string): SiteEntry {
  const site = sites.find((s) => s.name === name);
  if (!site) {
    throw new Error(`Site "${name}" not found in sites.json`);
  }
  return site;
}
