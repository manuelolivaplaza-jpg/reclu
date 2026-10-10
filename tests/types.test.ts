import { describe, it, expect } from "vitest";
import { FREE_PLAN_FOLLOW_LIMIT, CATEGORY_META, type PortfolioCategory } from "@/lib/types";

describe("freemium constants", () => {
  it("free plan allows exactly 2 follows", () => {
    expect(FREE_PLAN_FOLLOW_LIMIT).toBe(2);
  });
});

describe("CATEGORY_META", () => {
  const expectedCategories: PortfolioCategory[] = [
    "political_us",
    "thematic",
    "broker_cl",
    "public_disclosure",
    "hedge_fund",
    "model",
  ];

  it("covers every PortfolioCategory", () => {
    for (const cat of expectedCategories) {
      expect(CATEGORY_META[cat]).toBeDefined();
      expect(CATEGORY_META[cat].label.length).toBeGreaterThan(0);
      expect(CATEGORY_META[cat].description.length).toBeGreaterThan(0);
    }
  });
});
