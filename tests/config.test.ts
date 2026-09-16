import { unlinkSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const TEST_CONFIG_PATH = "test-siteclaw.config.json";

describe("loadConfig", () => {
  it("returns defaults when no config file exists", () => {
    expect(loadConfig("nonexistent.config.json")).toEqual({
      dbPath: "siteclaw.db",
      sitesPath: "sites.json",
      opportunityAudits: ["uses-optimized-images", "unused-css-rules", "unused-javascript", "total-byte-weight"],
    });
  });

  it("merges overrides on top of defaults", () => {
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ dbPath: "custom.db" }));
    try {
      const config = loadConfig(TEST_CONFIG_PATH);
      expect(config.dbPath).toBe("custom.db");
      expect(config.sitesPath).toBe("sites.json");
    } finally {
      unlinkSync(TEST_CONFIG_PATH);
    }
  });
});
