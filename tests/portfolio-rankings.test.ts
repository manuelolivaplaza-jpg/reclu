import { describe, expect, it, vi } from "vitest";

/**
 * D2 — rankings de portafolios en la home.
 *
 * Se prueban las funciones puras de `src/lib/portfolio-rankings.ts`:
 *  - `periodReturn`: retorno de la ventana y `null` cuando la serie no
 *    cubre el período (no se inventa ni se completa el dato).
 *  - `topByReturn` / `topByFollowers`: orden y corte del top 5.
 *  - `filterPremium`: el muro de pago (los premium solo para quien paga).
 *  - `formatReturnPct`: formato de porcentaje en estilo chileno.
 *
 * El loader de servidor no se ejercita acá: los mocks de Supabase viven en
 * `tests/muro-app.test.ts`. Acá no se toca la red.
 */

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    rpc: vi.fn(async () => ({ data: [], error: null })),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => null),
}));

import {
  filterPremium,
  formatReturnPct,
  initialsOf,
  periodReturn,
  topByFollowers,
  topByReturn,
  RANKING_PERIODS,
  type RankingEntry,
} from "@/lib/portfolio-rankings";

const DAY_MS = 86_400_000;

/** Serie de niveles (índice base 100) con un punto por día. */
function dailySeries(days: number, start: number, step: number) {
  const startTime = Date.parse("2026-01-01T00:00:00Z");
  return Array.from({ length: days }, (_, index) => ({
    date: new Date(startTime + index * DAY_MS).toISOString().slice(0, 10),
    value: start + index * step,
  }));
}

function entry(overrides: Partial<RankingEntry> = {}): RankingEntry {
  return {
    slug: "slug",
    name: "Portafolio",
    manager: null,
    coverImage: null,
    followers: 100,
    returnPct: null,
    ...overrides,
  };
}

describe("periodReturn", () => {
  it("mide el retorno de la ventana contra el punto de corte", () => {
    // 31 puntos diarios 100 -> 130. La ventana de 30 días parte del primer
    // punto (100) y termina en el último (130): +30%.
    const series = dailySeries(31, 100, 1);
    expect(periodReturn(series, 30)).toBeCloseTo(30, 2);
  });

  it("usa el punto más reciente dentro de la ventana", () => {
    // 10 puntos diarios 100 -> 109. La ventana de 7 días parte del punto
    // que cae en el corte (día -7 = 102) y termina en 109: +6,86%.
    const series = dailySeries(10, 100, 1);
    expect(periodReturn(series, 7)).toBeCloseTo(6.86, 2);
  });

  it("devuelve null si la serie no cubre el período", () => {
    const series = dailySeries(10, 100, 1);
    expect(periodReturn(series, 30)).toBeNull();
    expect(periodReturn(series, 365)).toBeNull();
  });

  it("devuelve null con menos de dos puntos o con días inválidos", () => {
    expect(periodReturn([], 7)).toBeNull();
    expect(periodReturn([{ date: "2026-01-01", value: 100 }], 7)).toBeNull();
    expect(periodReturn(dailySeries(10, 100, 1), 0)).toBeNull();
    expect(periodReturn(dailySeries(10, 100, 1), -5)).toBeNull();
  });

  it("ordena la serie por fecha antes de medir", () => {
    const series = dailySeries(10, 100, 1).reverse();
    expect(periodReturn(series, 7)).toBeCloseTo(6.86, 2);
  });

  it("mapea los períodos del selector a sus días", () => {
    const expected: Record<string, number> = {
      "1S": 7,
      "1M": 30,
      "3M": 91,
      "6M": 182,
      "1A": 365,
      "2A": 730,
    };
    for (const period of RANKING_PERIODS) {
      expect(period.days).toBe(expected[period.id]);
    }
  });
});

describe("topByReturn", () => {
  it("ordena de mayor a menor y corta el top 5", () => {
    const rows = topByReturn(
      [
        entry({ slug: "a", returnPct: 3 }),
        entry({ slug: "b", returnPct: 12 }),
        entry({ slug: "c", returnPct: -4 }),
        entry({ slug: "d", returnPct: 8 }),
        entry({ slug: "e", returnPct: 20 }),
        entry({ slug: "f", returnPct: 1 }),
      ],
      5,
    );
    expect(rows.map((row) => row.slug)).toEqual(["e", "b", "d", "a", "f"]);
  });

  it("deja fuera a los que no tienen dato", () => {
    const rows = topByReturn([
      entry({ slug: "con", returnPct: 5 }),
      entry({ slug: "sin", returnPct: null }),
    ]);
    expect(rows.map((row) => row.slug)).toEqual(["con"]);
  });

  it("desempata por seguidores y luego por nombre", () => {
    const rows = topByReturn([
      entry({ slug: "b", name: "B", returnPct: 5, followers: 10 }),
      entry({ slug: "a", name: "A", returnPct: 5, followers: 50 }),
    ]);
    expect(rows.map((row) => row.slug)).toEqual(["a", "b"]);
  });
});

describe("topByFollowers", () => {
  it("ordena por seguidores y corta el top 5", () => {
    const rows = topByFollowers(
      [
        entry({ slug: "a", followers: 10 }),
        entry({ slug: "b", followers: 90 }),
        entry({ slug: "c", followers: 50 }),
        entry({ slug: "d", followers: 70 }),
        entry({ slug: "e", followers: 30 }),
        entry({ slug: "f", followers: 20 }),
      ],
      5,
    );
    expect(rows.map((row) => row.slug)).toEqual(["b", "d", "c", "e", "f"]);
  });
});

describe("filterPremium (muro de pago)", () => {
  const list = [
    { slug: "gratis", premium: false },
    { slug: "pro", premium: true },
  ];

  it("saca los premium cuando el visitante no paga", () => {
    expect(filterPremium(list, false).map((item) => item.slug)).toEqual(["gratis"]);
  });

  it("deja los premium cuando el visitante paga", () => {
    expect(filterPremium(list, true).map((item) => item.slug)).toEqual([
      "gratis",
      "pro",
    ]);
  });
});

describe("formatReturnPct", () => {
  it("usa el formato chileno con coma decimal", () => {
    expect(formatReturnPct(12.34)).toBe("+12,3%");
    expect(formatReturnPct(-4.56)).toBe("-4,6%");
    expect(formatReturnPct(0)).toBe("0,0%");
  });

  it("muestra un guion cuando no hay dato", () => {
    expect(formatReturnPct(null)).toBe("—");
    expect(formatReturnPct(undefined)).toBe("—");
  });
});

describe("initialsOf", () => {
  it("saca las iniciales del nombre", () => {
    expect(initialsOf("Nancy Pelosi")).toBe("NP");
    expect(initialsOf("Renta 4")).toBe("R4");
    expect(initialsOf("Scion Asset Management")).toBe("SA");
    expect(initialsOf(null)).toBe("");
  });
});
