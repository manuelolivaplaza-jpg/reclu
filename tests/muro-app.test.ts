import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SD2-B: la app lee series, métricas y alertas por las RPC del muro (048).
 * Ningún test toca Supabase real: `createClient` está mockeado y el único
 * camino de datos es `rpc`.
 */
const mocks = vi.hoisted(() => ({
  plan: "anon" as "anon" | "free" | "pro" | "elite",
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: mocks.rpc,
  })),
}));

import { getPerformance, getAlerts } from "@/lib/queries";
import { getPrecomputedMetrics } from "@/lib/performance-queries";
import { rankSources, splitByOutcome } from "@/lib/ranking";
import type { Alert } from "@/lib/types";

// isSupabaseLive() se evalúa en cada llamada: con esto los tests usan la RPC
// mockeada en vez del catálogo demo.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

const PREMIUM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FREE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DAY_MS = 86_400_000;
const LAST_DAY = Date.parse("2026-06-01T00:00:00Z");

function isoDay(offset: number): string {
  return new Date(LAST_DAY + offset * DAY_MS).toISOString().slice(0, 10);
}

function series(points: number, startOffset: number) {
  return Array.from({ length: points }, (_, index) => ({
    date: isoDay(startOffset + index),
    value_pct: index * 0.1,
  }));
}

function alert(index: number, summary: string | null): Alert {
  return {
    id: `alert-${index}`,
    portfolio_id: FREE_ID,
    type: "weight_change",
    severity: "medium",
    title: `Alerta ${index}`,
    summary,
    payload: {},
    created_at: `2026-05-${String(10 + index).padStart(2, "0")}T00:00:00Z`,
  };
}

const ALERTS = [0, 1, 2, 3, 4].map((index) => alert(index, `Resumen ${index}`));

const METRIC = {
  portfolio_id: FREE_ID,
  period: "TOTAL",
  return_pct: 12.5,
  benchmark_return_pct: 8,
  sharpe: 1.2,
  max_drawdown: -5,
  volatility: 14,
  alpha_pct: 2.1,
  win_rate: 55,
  data_points: 120,
  as_of: "2026-05-30",
  benchmark_symbol: "^GSPC",
  method: "scraper",
};

function isPaid(): boolean {
  return mocks.plan === "pro" || mocks.plan === "elite";
}

beforeEach(() => {
  mocks.plan = "anon";
  mocks.rpc.mockReset();
  mocks.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "get_alerts") {
      // A propósito devuelve 5 aunque el plan sea anon: la app debe recortar.
      return { data: ALERTS, error: null };
    }
    if (fn === "get_portfolio_performance") {
      if (args.p_portfolio === PREMIUM_ID && !isPaid()) return { data: [], error: null };
      // 150 días: más de los 90 que puede ver un plan gratis.
      return { data: series(150, -149), error: null };
    }
    if (fn === "get_portfolio_metrics") {
      if (args.p_portfolio === PREMIUM_ID && !isPaid()) return { data: [], error: null };
      return { data: [METRIC], error: null };
    }
    return { data: null, error: { message: `RPC inesperada: ${fn}` } };
  });
});

describe("series premium detrás del muro", () => {
  it("free no recibe la serie de un portafolio premium", async () => {
    mocks.plan = "free";
    const result = await getPerformance(PREMIUM_ID, 365, {
      role: "free",
      source: "sec_13f",
    });

    expect(result).toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_portfolio_performance", {
      p_portfolio: PREMIUM_ID,
    });
  });

  it("free recibe solo los últimos 90 días, aunque la RPC devuelva más", async () => {
    mocks.plan = "free";
    const result = await getPerformance(FREE_ID, 365, {
      role: "free",
      source: "model",
    });

    expect(result).toHaveLength(90);
    const latest = Date.parse(`${result[result.length - 1].date}T00:00:00Z`);
    const first = Date.parse(`${result[0].date}T00:00:00Z`);
    expect((latest - first) / DAY_MS).toBe(89);
  });

  it("pro recibe la serie completa", async () => {
    mocks.plan = "pro";
    const result = await getPerformance(FREE_ID, 365, {
      role: "paid",
      source: "model",
    });

    expect(result).toHaveLength(150);
  });
});

describe("métricas premium detrás del muro", () => {
  it("free no recibe métricas de un portafolio premium", async () => {
    mocks.plan = "free";
    const metrics = await getPrecomputedMetrics(PREMIUM_ID, "^GSPC");

    expect(metrics).toBeNull();
  });

  it("free sí recibe métricas de un portafolio no premium", async () => {
    mocks.plan = "free";
    const metrics = await getPrecomputedMetrics(FREE_ID, "^GSPC");

    expect(metrics?.return_pct).toBe(12.5);
    expect(metrics?.sharpe).toBe(1.2);
  });
});

describe("alertas por plan", () => {
  it("anon recibe máximo 3 alertas y sin resumen AI", async () => {
    mocks.plan = "anon";
    const alerts = await getAlerts(undefined, 20, { role: "anon" });

    expect(alerts).toHaveLength(3);
    expect(alerts.every((item) => item.summary === null)).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("get_alerts", {
      p_portfolio: null,
      p_limit: 20,
    });
  });

  it("pro recibe el resumen AI", async () => {
    mocks.plan = "pro";
    const alerts = await getAlerts(undefined, 20, { role: "paid" });

    expect(alerts).toHaveLength(5);
    expect(alerts.every((item) => item.summary !== null)).toBe(true);
  });
});

describe("ranking con candado", () => {
  it("una fila premium bloqueada se muestra sin cifras y queda fuera del ranking", () => {
    const rows = rankSources([
      {
        id: "premium",
        name: "Premium",
        kind: "portfolio",
        country: "US",
        returnPct: null,
        benchmarkReturnPct: null,
        dataPoints: null,
        asOf: "",
        locked: true,
      },
      {
        id: "free",
        name: "Free",
        kind: "portfolio",
        country: "US",
        returnPct: 12,
        benchmarkReturnPct: 8,
        dataPoints: 120,
        asOf: "2026-05-30",
      },
    ]);

    const { winners, noData } = splitByOutcome(rows);
    expect(winners.map((row) => row.id)).toEqual(["free"]);
    expect(noData).toHaveLength(1);
    expect(noData[0].locked).toBe(true);
    expect(noData[0].excessReturnPct).toBeNull();
  });
});
