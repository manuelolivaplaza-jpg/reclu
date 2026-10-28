import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pickCardStats } from "@/lib/queries";

describe("/explore rapido (D43)", () => {
  it("pickCardStats usa las tarjetas cacheadas y deja sin cifra las que faltan", () => {
    const all = { a: { pct: 12.5, label: "desde ene 2025", spark: [1, 2], estimated: false, asOf: "2026-10-20" } };
    const out = pickCardStats([{ id: "a", slug: "a" }, { id: "b", slug: "b" }], all);
    expect(out.a.pct).toBe(12.5);
    expect(out.b).toEqual({ pct: null, label: "", spark: [], estimated: false, asOf: null });
  });

  it("las consultas pesadas de /explore usan cache remoto y la pagina no baja series", () => {
    const q = readFileSync("src/lib/queries.ts", "utf8");
    const p = readFileSync("src/lib/performance-queries.ts", "utf8");
    const page = readFileSync("src/app/explore/page.tsx", "utf8");
    const section = readFileSync("src/components/explore/explore-rankings-section.tsx", "utf8");
    expect(q.match(/"use cache: remote"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(p).toContain('"use cache: remote"');
    expect(page).not.toContain("getPerformanceSeriesAdmin");
    expect(section).not.toContain("getPerformanceSeriesAdmin");
    expect(section).not.toContain("getAlerts(");
  });
});
