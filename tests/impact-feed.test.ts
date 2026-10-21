import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * F72: feed "Noticias que te tocan".
 *
 * El ordenamiento y el retraso por plan son funciones puras. El render usa
 * `react-dom/server` y mockea `impact-client`, así que no hay fetch ni LLM.
 */

vi.mock("@/lib/impact-client", () => ({
  requestImpact: vi.fn(async () => ({
    status: "unavailable",
    message: "sin endpoint",
  })),
}));

import {
  buildImpactFeed,
  formatExposure,
  formatNewsDate,
  isNewsVisibleAt,
  newsDelayCutoff,
  type FeedNews,
} from "@/lib/impact-feed";
import { portfolioLimitsFor } from "@/lib/plans";
import { loadRecentNews } from "@/lib/news-feed";
import type { Position, TickerProfile } from "@/lib/news-match";
import { ImpactFeed } from "@/components/impact-feed";

const NOW = Date.parse("2026-10-20T12:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * 3_600_000).toISOString();
}

const POSITIONS: Position[] = [
  { symbol: "AAPL", weight: 50 },
  { symbol: "MSFT", weight: 40 },
  { symbol: "XOM", weight: 10 },
];

const PROFILES: TickerProfile[] = [
  {
    symbol: "AAPL",
    sector: "Tecnología",
    industry: "Hardware",
    peers: ["MSFT"],
    suppliers: [],
    macroFactors: [],
  },
  {
    symbol: "MSFT",
    sector: "Tecnología",
    industry: "Software",
    peers: ["AAPL"],
    suppliers: [],
    macroFactors: [],
  },
  {
    symbol: "XOM",
    sector: "Energía",
    industry: "Petróleo",
    peers: [],
    suppliers: [],
    macroFactors: ["petroleo"],
  },
];

function news(overrides: Partial<FeedNews> & Pick<FeedNews, "id" | "title">): FeedNews {
  return {
    source: "sec_8k",
    url: `https://example.com/${overrides.id}`,
    publishedAt: hoursAgo(30),
    tickers: [{ symbol: "AAPL", relation: "direct", confidence: 1 }],
    ...overrides,
  };
}

describe("buildImpactFeed: orden y exposición", () => {
  it("ordena por relevancia y desempata por fecha descendente", () => {
    const newsA = news({ id: "a", title: "Apple reporta resultados" });
    const newsB = news({
      id: "b",
      title: "Microsoft anuncia un dividendo",
      publishedAt: hoursAgo(2),
      tickers: [{ symbol: "MSFT", relation: "direct", confidence: 1 }],
    });
    const newsC = news({
      id: "c",
      title: "Sube el petróleo",
      publishedAt: hoursAgo(1),
      tickers: [],
    });

    const feed = buildImpactFeed({
      news: [newsC, newsB, newsA],
      positions: POSITIONS,
      profiles: PROFILES,
      plan: "elite",
      now: NOW,
    });

    expect(feed.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(feed[0].relevance).toBeCloseTo(0.5, 6);
    expect(feed[1].relevance).toBeCloseTo(0.4, 6);
    expect(feed[2].relations).toEqual(["macro"]);
  });

  it("en empate de relevancia gana la noticia más reciente", () => {
    const older = news({
      id: "older",
      title: "Apple, noticia vieja",
      publishedAt: hoursAgo(40),
    });
    const newer = news({
      id: "newer",
      title: "Apple, noticia nueva",
      publishedAt: hoursAgo(30),
    });

    const feed = buildImpactFeed({
      news: [older, newer],
      positions: POSITIONS,
      profiles: PROFILES,
      plan: "elite",
      now: NOW,
    });

    expect(feed.map((entry) => entry.id)).toEqual(["newer", "older"]);
  });

  it("la exposición es la suma de los pesos tocados, sin pasar de 100", () => {
    const both = news({
      id: "both",
      title: "Apple y Microsoft firman un acuerdo",
      tickers: [
        { symbol: "AAPL", relation: "direct", confidence: 1 },
        { symbol: "MSFT", relation: "direct", confidence: 1 },
      ],
    });

    const feed = buildImpactFeed({
      news: [both],
      positions: POSITIONS,
      profiles: PROFILES,
      plan: "elite",
      now: NOW,
    });

    expect(feed).toHaveLength(1);
    expect(feed[0].exposurePct).toBe(90);
    expect(feed[0].matches).toHaveLength(2);
    expect(feed[0].primary.symbol).toBe("AAPL");
  });

  it("un 8-K con item relevante sube la relevancia (importancia 1,2)", () => {
    const plain = news({ id: "plain", title: "Apple publica un comunicado" });
    const important = news({
      id: "8k",
      title: "Apple presenta un 8-K",
      form: "8-K",
      items: ["5.02"],
    });

    const feed = buildImpactFeed({
      news: [plain, important],
      positions: POSITIONS,
      profiles: PROFILES,
      plan: "elite",
      now: NOW,
    });

    expect(feed[0].id).toBe("8k");
    expect(feed[0].importance).toBeCloseTo(1.2, 6);
    expect(feed[0].relevance).toBeCloseTo(0.6, 6);
  });
});

describe("buildImpactFeed: retraso por plan", () => {
  const recent = news({
    id: "recent",
    title: "Apple reporta resultados",
    publishedAt: hoursAgo(12),
  });
  const old = news({
    id: "old",
    title: "Apple anuncia una recompra",
    publishedAt: hoursAgo(30),
  });

  it("Gratis espera 24 h y no muestra la noticia de hace 12 h", () => {
    const limits = portfolioLimitsFor("free", null, NOW);
    expect(limits.newsDelayHours).toBe(24);

    const feed = buildImpactFeed({
      news: [recent, old],
      positions: POSITIONS,
      profiles: PROFILES,
      plan: limits.plan,
      delayHours: limits.newsDelayHours,
      now: NOW,
    });

    expect(feed.map((entry) => entry.id)).toEqual(["old"]);
  });

  it("Pro muestra la noticia al día", () => {
    const limits = portfolioLimitsFor("pro", null, NOW);
    expect(limits.newsDelayHours).toBe(0);

    const feed = buildImpactFeed({
      news: [recent, old],
      positions: POSITIONS,
      profiles: PROFILES,
      plan: limits.plan,
      delayHours: limits.newsDelayHours,
      now: NOW,
    });

    expect(feed.map((entry) => entry.id)).toEqual(["recent", "old"]);
  });

  it("la prueba vigente de Gratis usa el retraso de Pro", () => {
    const trialEnds = new Date(NOW + 5 * 86_400_000).toISOString();
    const limits = portfolioLimitsFor("free", trialEnds, NOW);
    expect(limits.plan).toBe("pro");
    expect(limits.newsDelayHours).toBe(0);
    expect(isNewsVisibleAt(recent.publishedAt, limits.newsDelayHours, NOW)).toBe(true);
    expect(newsDelayCutoff(NOW, 24)).toBe(NOW - 24 * 3_600_000);
  });

  it("descarta fechas inválidas", () => {
    expect(isNewsVisibleAt("no-es-fecha", 0, NOW)).toBe(false);
  });
});

describe("formatos del feed", () => {
  it("fecha determinista sin depender de la zona horaria", () => {
    expect(formatNewsDate("2026-10-20T23:30:00.000Z")).toBe("20 oct 2026");
    expect(formatNewsDate("")).toBe("");
  });

  it("porcentaje con coma y un decimal", () => {
    expect(formatExposure(12.34)).toBe("12,3%");
    expect(formatExposure(0)).toBe("0,0%");
    expect(formatExposure(null)).toBe("—");
  });
});

describe("lectura pública de noticias", () => {
  it("pide solo las columnas permitidas por la migración 051 (nunca summary)", async () => {
    const selects: string[] = [];

    function makeBuilder() {
      const builder = {
        gte: () => builder,
        order: () => builder,
        limit: async () => ({ data: [], error: null }),
        in: async () => ({ data: [], error: null }),
      };
      return builder;
    }

    const client = {
      from: () => ({
        select: (columns: string) => {
          selects.push(columns);
          return makeBuilder();
        },
      }),
    };

    await loadRecentNews(
      client as unknown as Parameters<typeof loadRecentNews>[0],
      { sinceIso: hoursAgo(24 * 7) },
    );

    expect(selects).toHaveLength(1);
    expect(selects[0]).toBe("id, source, url, title, published_at");
    expect(selects[0]).not.toContain("summary");
  });
});

describe("render básico del feed", () => {
  it("pinta título, chips, exposición, fuente y botón de IA", () => {
    const feed = buildImpactFeed({
      news: [
        news({
          id: "apple-1",
          title: "Apple reporta resultados trimestrales",
          url: "https://example.com/apple-1",
          publishedAt: hoursAgo(30),
        }),
      ],
      positions: POSITIONS,
      profiles: PROFILES,
      plan: "free",
      delayHours: 24,
      now: NOW,
    });

    const html = renderToStaticMarkup(
      createElement(ImpactFeed, {
        entries: feed,
        planName: "Gratis",
        delayHours: 24,
        hasPositions: true,
      }),
    );

    expect(html).toContain("Noticias que te tocan");
    expect(html).toContain("Plan Gratis");
    expect(html).toContain("24 h");
    expect(html).toContain("Apple reporta resultados trimestrales");
    expect(html).toContain('href="https://example.com/apple-1"');
    expect(html).toContain("Directo");
    expect(html).toContain("50,0%");
    expect(html).toContain("SEC 8-K");
    expect(html).toContain("Pregunta a la IA");
    // El panel no está abierto hasta que el usuario lo pide.
    expect(html).not.toContain("Análisis con IA");
  });

  it("sin posiciones muestra una frase, no una caja vacía", () => {
    const html = renderToStaticMarkup(
      createElement(ImpactFeed, {
        entries: [],
        planName: "Gratis",
        delayHours: 24,
        hasPositions: false,
      }),
    );

    expect(html).toContain("Necesitamos al menos una posición");
    expect(html).not.toContain("Pregunta a la IA");
  });
});
