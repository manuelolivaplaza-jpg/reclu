import { describe, expect, it } from "vitest";
import { formatPercent, formatShortDate, formatSignedPct, MINUS } from "@/lib/utils";
import { formatReturnPct } from "@/lib/portfolio-rankings";

describe("D29 formato único", () => {
  it("signo menos U+2212, coma y raya sin dato", () => {
    expect(formatSignedPct(12.34)).toBe("+12,3%");
    expect(formatSignedPct(-4.56)).toBe(`${MINUS}4,6%`);
    expect(formatSignedPct(0)).toBe("0,0%");
    expect(formatSignedPct(null)).toBe("\u2014");
    expect(formatSignedPct(-0.004, 2)).toBe("0,00%");
    expect(formatPercent(-1)).toBe(`${MINUS}1,0%`);
    expect(formatReturnPct(-1)).toBe(formatSignedPct(-1));
  });
  it("fecha corta", () => {
    expect(formatShortDate("2026-10-22")).toBe("22 oct 2026");
    expect(formatShortDate(null)).toBe("");
  });
});
