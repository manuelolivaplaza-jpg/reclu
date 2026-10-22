import { describe, it, expect } from "vitest";
import { nextHidden } from "@/lib/use-hide-on-scroll";

describe("nextHidden", () => {
  const T = 10;

  it("is always visible while above the threshold", () => {
    expect(nextHidden(0, 0, false, T)).toBe(false);
    expect(nextHidden(0, 5, false, T)).toBe(false);
    expect(nextHidden(5, 9, true, T)).toBe(false);
  });

  it("hides when scrolling down", () => {
    expect(nextHidden(100, 140, false, T)).toBe(true);
  });

  it("shows again when scrolling up", () => {
    expect(nextHidden(140, 100, true, T)).toBe(false);
  });

  it("keeps the previous state when the position does not change", () => {
    expect(nextHidden(100, 100, true, T)).toBe(true);
    expect(nextHidden(100, 100, false, T)).toBe(false);
  });

  it("shows the header when coming back to the top", () => {
    // Hidden while going down, then the user scrolls back up to the top.
    const hidden = nextHidden(400, 200, true, T);
    expect(hidden).toBe(false);
    expect(nextHidden(200, 0, hidden, T)).toBe(false);
  });

  it("respects a custom threshold", () => {
    // With threshold 50 the header stays visible until 50px.
    expect(nextHidden(0, 30, false, 50)).toBe(false);
    expect(nextHidden(40, 60, false, 50)).toBe(true);
  });
});
