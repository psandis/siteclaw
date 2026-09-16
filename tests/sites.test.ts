import { unlinkSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { findSite, loadSites } from "../src/sites.js";

const TEST_SITES_PATH = "test-sites.json";

describe("loadSites", () => {
  afterEach(() => {
    unlinkSync(TEST_SITES_PATH);
  });

  it("parses a valid sites file", () => {
    writeFileSync(TEST_SITES_PATH, JSON.stringify([{ name: "a", url: "https://a.com" }]));
    expect(loadSites(TEST_SITES_PATH)).toEqual([{ name: "a", url: "https://a.com" }]);
  });

  it("rejects a non-array file", () => {
    writeFileSync(TEST_SITES_PATH, JSON.stringify({ name: "a" }));
    expect(() => loadSites(TEST_SITES_PATH)).toThrow(/must contain a JSON array/);
  });
});

describe("findSite", () => {
  it("finds a site by name", () => {
    const sites = [{ name: "a", url: "https://a.com" }];
    expect(findSite(sites, "a")).toEqual({ name: "a", url: "https://a.com" });
  });

  it("throws when the site is not configured", () => {
    expect(() => findSite([], "missing")).toThrow(/not found in sites.json/);
  });
});
