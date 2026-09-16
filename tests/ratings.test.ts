import { describe, expect, it } from "vitest";
import { rate } from "../src/ratings.js";

describe("rate", () => {
  it("rates LCP against Google's published Core Web Vitals thresholds", () => {
    expect(rate("lcp", 2000)).toBe("good");
    expect(rate("lcp", 2500)).toBe("good");
    expect(rate("lcp", 3000)).toBe("needs improvement");
    expect(rate("lcp", 5000)).toBe("poor");
  });

  it("rates CLS using its unitless thresholds", () => {
    expect(rate("cls", 0.05)).toBe("good");
    expect(rate("cls", 0.2)).toBe("needs improvement");
    expect(rate("cls", 0.3)).toBe("poor");
  });

  it("rates TBT", () => {
    expect(rate("tbt", 100)).toBe("good");
    expect(rate("tbt", 400)).toBe("needs improvement");
    expect(rate("tbt", 700)).toBe("poor");
  });

  it("treats the boundary value itself as still passing (<=, not <)", () => {
    expect(rate("lcp", 2500)).toBe("good");
    expect(rate("cls", 0.1)).toBe("good");
  });
});
