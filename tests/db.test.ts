import { unlinkSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getHistoryForSite, getLatestRunPerSite, insertRun, openDb } from "../src/db.js";
import type { LighthouseResult } from "../src/types.js";

const TEST_DB_PATH = "test-siteclaw.db";

function makeResult(score: number): LighthouseResult {
  return {
    performanceScore: score,
    renderBlockingResources: [{ url: "https://example.com/blocking.js", wastedMs: 100 }],
    opportunities: [],
  };
}

describe("db", () => {
  let db: ReturnType<typeof openDb>;

  beforeEach(() => {
    db = openDb(TEST_DB_PATH);
  });

  afterEach(() => {
    db.close();
    unlinkSync(TEST_DB_PATH);
  });

  it("stores and retrieves a run", () => {
    insertRun(db, "site-a", "https://site-a.com", makeResult(80), "first deploy");
    const history = getHistoryForSite(db, "site-a");

    expect(history).toHaveLength(1);
    expect(history[0].performanceScore).toBe(80);
    expect(history[0].note).toBe("first deploy");
    expect(history[0].renderBlockingResources[0].url).toBe("https://example.com/blocking.js");
  });

  it("returns only the latest run per site", () => {
    insertRun(db, "site-a", "https://site-a.com", makeResult(80), null);
    insertRun(db, "site-a", "https://site-a.com", makeResult(90), null);
    insertRun(db, "site-b", "https://site-b.com", makeResult(50), null);

    const latest = getLatestRunPerSite(db);
    const siteA = latest.find((r) => r.siteName === "site-a");
    const siteB = latest.find((r) => r.siteName === "site-b");

    expect(latest).toHaveLength(2);
    expect(siteA?.performanceScore).toBe(90);
    expect(siteB?.performanceScore).toBe(50);
  });

  it("returns history in chronological order", () => {
    insertRun(db, "site-a", "https://site-a.com", makeResult(80), null);
    insertRun(db, "site-a", "https://site-a.com", makeResult(70), null);
    insertRun(db, "site-a", "https://site-a.com", makeResult(95), null);

    const history = getHistoryForSite(db, "site-a");
    expect(history.map((r) => r.performanceScore)).toEqual([80, 70, 95]);
  });

  it("returns an empty array for a site with no runs", () => {
    expect(getHistoryForSite(db, "nonexistent")).toEqual([]);
  });
});
