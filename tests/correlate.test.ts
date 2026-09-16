import { describe, expect, it } from "vitest";
import { findSharedRenderBlockingResources } from "../src/correlate.js";
import type { Run } from "../src/types.js";

function makeRun(siteName: string, blockingUrls: string[]): Run {
  return {
    id: 0,
    siteName,
    url: `https://${siteName}.com`,
    timestamp: new Date().toISOString(),
    performanceScore: 50,
    renderBlockingResources: blockingUrls.map((url) => ({ url, wastedMs: 100 })),
    opportunities: [],
    note: null,
  };
}

describe("findSharedRenderBlockingResources", () => {
  it("finds a resource shared across two or more sites", () => {
    const runs = [
      makeRun("site-a", ["https://shared.com/lib.js"]),
      makeRun("site-b", ["https://shared.com/lib.js"]),
      makeRun("site-c", ["https://only-c.com/lib.js"]),
    ];

    const shared = findSharedRenderBlockingResources(runs);
    expect(shared.get("https://shared.com/lib.js")).toEqual(["site-a", "site-b"]);
    expect(shared.has("https://only-c.com/lib.js")).toBe(false);
  });

  it("returns an empty map when nothing is shared", () => {
    const runs = [makeRun("site-a", ["https://a.com/lib.js"]), makeRun("site-b", ["https://b.com/lib.js"])];
    expect(findSharedRenderBlockingResources(runs).size).toBe(0);
  });

  it("returns an empty map for no runs", () => {
    expect(findSharedRenderBlockingResources([]).size).toBe(0);
  });
});
