import type { CoreMetrics } from "./types.js";

export type Rating = "good" | "needs improvement" | "poor";
export type MetricKey = keyof CoreMetrics | "ttfb";

// Thresholds are Google's own published Core Web Vitals / Lighthouse metric boundaries
// (web.dev / Chrome for Developers), not invented here. TTI and Speed Index use Lighthouse's
// own lab-data scoring curves rather than a field-data Core Web Vital, but the same
// good/needs-improvement/poor framing is applied for consistency in the CLI's output.
// ttfb: web.dev's published Time to First Byte thresholds (not itself a Core Web Vital, but
// published with the same good/needs-improvement/poor framing).
const THRESHOLDS: Record<MetricKey, [good: number, needsImprovement: number]> = {
  fcp: [1800, 3000],
  lcp: [2500, 4000],
  speedIndex: [3400, 5800],
  tti: [3800, 7300],
  tbt: [200, 600],
  cls: [0.1, 0.25],
  ttfb: [800, 1800],
};

export function rate(metric: MetricKey, value: number): Rating {
  const [good, needsImprovement] = THRESHOLDS[metric];
  if (value <= good) return "good";
  if (value <= needsImprovement) return "needs improvement";
  return "poor";
}
