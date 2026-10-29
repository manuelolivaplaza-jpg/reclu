import { describe, expect, it } from "vitest";
import { familyOf, topByReturnDiverse, type RankingEntry } from "@/lib/portfolio-rankings";

const e = (slug: string, name: string, manager: string | null, category: string, returnPct: number): RankingEntry => ({
  slug, name, manager, coverImage: null, category: category as RankingEntry["category"], followers: 0, returnPct,
});

describe("D67 familyOf", () => {
  it("agrupa ARK, AFP y Renta 4", () => {
    expect(familyOf(e("arkk", "ARK Innovation", "ARK Invest", "etf", 1))).toBe("ark");
    expect(familyOf(e("arkg", "ARK Genomic Revolution", null, "etf", 1))).toBe("ark");
    expect(familyOf(e("afp-uno", "AFP UNO: acciones", null, "pension", 1))).toBe("afp");
    expect(familyOf(e("r4", "Renta 4 — Cartera Moderada", null, "broker_cl", 1))).toBe("renta4");
  });
});

describe("D67 topByReturnDiverse", () => {
  it("el #1 es el mejor real, una sola ARK y max 2 por categoria", () => {
    const rows = topByReturnDiverse([
      e("arkg", "ARK Genomic", null, "etf", 60),
      e("arkk", "ARK Innovation", null, "etf", 59),
      e("arkq", "ARK Autonomous", null, "etf", 58),
      e("smh", "VanEck Semiconductor", "VanEck", "etf", 55),
      e("copx", "Copper Miners", "Global X", "etf", 50),
      e("trump-dice", "Trump dice", "Donald Trump", "political_us", 120),
      e("pelosi", "Pelosi Tracker", "Nancy Pelosi", "political_us", 40),
      e("btg", "BTG Cartera", "BTG", "broker_cl", 30),
    ]);
    expect(rows[0].slug).toBe("trump-dice");
    expect(rows.filter((r) => r.slug.startsWith("ark"))).toHaveLength(1);
    expect(rows.map((r) => r.slug)).toEqual(["trump-dice", "arkg", "smh", "pelosi", "btg"]);
  });
  it("relaja la categoria si faltan filas, nunca la familia", () => {
    const rows = topByReturnDiverse([
      e("a", "ARK A", null, "etf", 3), e("b", "ARK B", null, "etf", 2), e("c", "X", "x", "etf", 1), e("d", "Y", "y", "etf", 0.5),
    ]);
    expect(rows.map((r) => r.slug)).toEqual(["a", "c", "d"]);
  });
});
