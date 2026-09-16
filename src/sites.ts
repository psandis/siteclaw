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

// Matches "https://example.com" as-is, and bare domains like "example.com" or
// "www.google.com" (no scheme) so a one-off check doesn't require typing the "https://".
function looksLikeUrl(value: string): boolean {
  if (/^https?:\/\//i.test(value)) return true;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(value);
}

// A configured site name always wins over URL-guessing, so a site intentionally named like
// a domain (e.g. "client-a.com") still resolves from sites.json rather than being treated
// as an unregistered one-off check. sites.json is allowed to be missing entirely here: a raw
// URL/domain needs no sites.json at all.
export function resolveSiteOrUrl(siteOrUrl: string, sitesPath: string): SiteEntry {
  let sites: SiteEntry[] = [];
  try {
    sites = loadSites(sitesPath);
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }

  const configured = sites.find((s) => s.name === siteOrUrl);
  if (configured) return configured;

  if (looksLikeUrl(siteOrUrl)) {
    const url = /^https?:\/\//i.test(siteOrUrl) ? siteOrUrl : `https://${siteOrUrl}`;
    return { name: siteOrUrl, url };
  }

  throw new Error(
    `"${siteOrUrl}" is not a configured site name in ${sitesPath} and doesn't look like a URL.`,
  );
}
