// tests/unit/metric-registry.test.ts
import { describe, expect, it } from "vitest";
import { METRIC_REGISTRY, getMetric, getAllMetrics, isMetricId } from "../../lib/analytics/metric-registry";

describe("analytics/metric-registry - D-15", () => {
  it("every registered MetricId exposes all seven fields as non-empty values", () => {
    const metrics = getAllMetrics();
    expect(metrics.length).toBeGreaterThan(0);
    
    for (const metric of metrics) {
      expect(metric.id).toBeTruthy();
      expect(typeof metric.id).toBe("string");
      expect(metric.id.length).toBeGreaterThan(0);
      
      expect(metric.label).toBeTruthy();
      expect(typeof metric.label).toBe("string");
      expect(metric.label.length).toBeGreaterThan(0);
      
      expect(metric.formula).toBeTruthy();
      expect(typeof metric.formula).toBe("string");
      expect(metric.formula.length).toBeGreaterThan(0);
      
      expect(metric.source).toBeTruthy();
      expect(typeof metric.source).toBe("string");
      expect(metric.source.length).toBeGreaterThan(0);
      
      expect(metric.direction).toBeTruthy();
      expect(["up-good", "down-good", "neutral"]).toContain(metric.direction);
      
      expect(metric.constraints).toBeTruthy();
      expect(typeof metric.constraints).toBe("string");
      expect(metric.constraints.length).toBeGreaterThan(0);
    }
  });

  it("registry contains Phase 12 dashboard metrics with stable ids", () => {
    expect(isMetricId("MRR")).toBe(true);
    expect(isMetricId("ARR")).toBe(true);
    expect(isMetricId("activeKeys")).toBe(true);
    expect(isMetricId("paidCashRub")).toBe(true);
    expect(isMetricId("newUsers")).toBe(true);
    expect(isMetricId("renewOrders")).toBe(true);
    
    const mrr = getMetric("MRR");
    expect(mrr).toBeDefined();
    expect(mrr?.label).toBeTruthy();
    expect(mrr?.direction).toBe("up-good");
  });
});
