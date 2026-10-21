import { describe, it, expect } from "vitest";
import {
  matchNewsToPortfolio,
  exposurePct,
  newsImportance,
  isImportantEightK,
  MACRO_KEYWORDS,
  type NewsItem,
  type Position,
  type TickerProfile,
} from "@/lib/news-match";

function profile(
  symbol: string,
  overrides: Partial<Omit<TickerProfile, "symbol">> = {},
): TickerProfile {
  return {
    symbol,
    sector: "Technology",
    industry: "Software",
    peers: [],
    suppliers: [],
    macroFactors: [],
    ...overrides,
  };
}

function news(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: "n1",
    source: "sec_edgar",
    title: "Apple announces results",
    publishedAt: "2026-10-20T12:00:00Z",
    tickers: [{ symbol: "AAPL", relation: "direct", confidence: 0.9 }],
    ...overrides,
  };
}

const positions: Position[] = [
  { symbol: "AAPL", weight: 20 },
  { symbol: "MSFT", weight: 30 },
  { symbol: "TSLA", weight: 10 },
];

const profiles: TickerProfile[] = [
  profile("AAPL", { peers: ["MSFT"], suppliers: ["TSM"] }),
  profile("MSFT"),
  profile("TSLA", { sector: "Consumer Discretionary", peers: ["RIVN"] }),
  profile("RIVN", { sector: "Consumer Discretionary" }),
  profile("TSM", { sector: "Technology" }),
];

describe("matchNewsToPortfolio: relaciones", () => {
  it("directo: el ticker de la noticia está en la cartera y usa la confianza de la fuente", () => {
    const matches = matchNewsToPortfolio(news(), positions, profiles, {
      relations: ["direct"],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      symbol: "AAPL",
      relation: "direct",
      confidence: 0.9,
      exposurePct: 20,
    });
    expect(matches[0].relevance).toBeCloseTo(0.9 * 0.2, 6);
  });

  it("sector: comparte sector con una posición, confianza 0,5", () => {
    const n = news({
      tickers: [{ symbol: "MSFT", relation: "direct", confidence: 1 }],
    });
    const matches = matchNewsToPortfolio(n, positions, profiles, {
      relations: ["sector"],
    });
    // AAPL es Technology; TSLA no.
    expect(matches.map((m) => m.symbol)).toEqual(["AAPL"]);
    expect(matches[0].relation).toBe("sector");
    expect(matches[0].confidence).toBe(0.5);
    expect(matches[0].relevance).toBeCloseTo(0.5 * 0.2, 6);
  });

  it("competidor: el ticker está en peers de una posición, confianza 0,4", () => {
    const n = news({
      tickers: [{ symbol: "RIVN", relation: "direct", confidence: 1 }],
    });
    const matches = matchNewsToPortfolio(n, positions, profiles, {
      relations: ["competitor"],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      symbol: "TSLA",
      relation: "competitor",
      confidence: 0.4,
      exposurePct: 10,
    });
    expect(matches[0].relevance).toBeCloseTo(0.4 * 0.1, 6);
  });

  it("proveedor: el ticker está en suppliers de una posición, confianza 0,4", () => {
    const n = news({
      tickers: [{ symbol: "TSM", relation: "direct", confidence: 1 }],
    });
    const matches = matchNewsToPortfolio(n, positions, profiles, {
      relations: ["supplier"],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      symbol: "AAPL",
      relation: "supplier",
      confidence: 0.4,
    });
  });

  it("macro en español: cobre calza con macroFactors", () => {
    const cartera: Position[] = [{ symbol: "SQM", weight: 40 }];
    const perfiles = [
      profile("SQM", { sector: "Materials", macroFactors: ["cobre"] }),
    ];
    const n = news({
      title: "El precio del cobre sube con fuerza",
      tickers: [],
    });
    const matches = matchNewsToPortfolio(n, cartera, perfiles, {
      relations: ["macro"],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      symbol: "SQM",
      relation: "macro",
      confidence: 0.3,
    });
    expect(matches[0].relevance).toBeCloseTo(0.3 * 0.4, 6);
  });

  it("macro en inglés: lithium calza con macroFactors en español", () => {
    const cartera: Position[] = [{ symbol: "ALB", weight: 25 }];
    const perfiles = [
      profile("ALB", { sector: "Materials", macroFactors: ["litio"] }),
    ];
    const matches = matchNewsToPortfolio(
      news({ title: "Lithium prices jump", tickers: [] }),
      cartera,
      perfiles,
      { relations: ["macro"] },
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].relation).toBe("macro");
  });

  it("macro no calza si el título no trae la keyword del perfil", () => {
    const cartera: Position[] = [{ symbol: "SQM", weight: 40 }];
    const perfiles = [profile("SQM", { macroFactors: ["litio"] })];
    const matches = matchNewsToPortfolio(
      news({ title: "El precio del cobre sube", tickers: [] }),
      cartera,
      perfiles,
      { relations: ["macro"] },
    );
    expect(matches).toEqual([]);
  });
});

describe("relevancia e importancia", () => {
  it("un 8-K con item 5.02 multiplica la relevancia por 1,2", () => {
    const n = news({
      title: "8-K - Item 5.02 Departure of Directors",
      tickers: [{ symbol: "AAPL", relation: "direct", confidence: 1 }],
    });
    const matches = matchNewsToPortfolio(
      n,
      [{ symbol: "AAPL", weight: 50 }],
      profiles,
      { relations: ["direct"] },
    );
    expect(matches[0].relevance).toBeCloseTo(1 * 0.5 * 1.2, 6);
    expect(newsImportance(n)).toBe(1.2);
    expect(isImportantEightK(n)).toBe(true);
  });

  it("un 8-K sin items relevantes mantiene importancia 1", () => {
    expect(
      newsImportance({ title: "8-K - Item 8.01 Other Events" }),
    ).toBe(1);
    expect(newsImportance({ title: "Apple announces results" })).toBe(1);
  });

  it("lee el item del campo items y exige que el formulario sea 8-K", () => {
    expect(
      newsImportance({ title: "Current report", form: "8-K", items: ["1.01"] }),
    ).toBe(1.2);
    expect(
      newsImportance({ title: "Current report", form: "10-Q", items: ["5.02"] }),
    ).toBe(1);
  });

  it("ordena por relevancia descendente", () => {
    const cartera: Position[] = [
      { symbol: "AAPL", weight: 10 },
      { symbol: "MSFT", weight: 80 },
    ];
    const n = news({
      tickers: [
        { symbol: "AAPL", relation: "direct", confidence: 1 },
        { symbol: "MSFT", relation: "direct", confidence: 1 },
      ],
    });
    const matches = matchNewsToPortfolio(n, cartera, profiles, {
      relations: ["direct"],
    });
    expect(matches.map((m) => m.symbol)).toEqual(["MSFT", "AAPL"]);
  });
});

describe("filtros", () => {
  const n = news({
    title: "Copper and rates move markets",
    tickers: [
      { symbol: "AAPL", relation: "direct", confidence: 1 },
      { symbol: "MSFT", relation: "direct", confidence: 1 },
    ],
  });
  const perfiles = [
    profile("AAPL", { macroFactors: ["cobre"] }),
    profile("MSFT", { macroFactors: ["tasas"] }),
    profile("TSLA", { sector: "Consumer Discretionary", macroFactors: ["tasas"] }),
  ];

  it("Gratis solo ve relaciones directas", () => {
    const matches = matchNewsToPortfolio(n, positions, perfiles, {
      plan: "free",
    });
    expect(matches.map((m) => m.relation)).toEqual(["direct", "direct"]);
    expect(matches.map((m) => m.symbol).sort()).toEqual(["AAPL", "MSFT"]);
  });

  it("Pro ve directo + sector", () => {
    const matches = matchNewsToPortfolio(
      news({
        tickers: [
          { symbol: "AAPL", relation: "direct", confidence: 1 },
          { symbol: "TSM", relation: "direct", confidence: 1 },
        ],
      }),
      positions,
      profiles,
      { plan: "pro" },
    );
    expect(matches.some((m) => m.relation === "sector")).toBe(true);
    expect(matches.some((m) => m.relation === "macro")).toBe(false);
  });

  it("Elite ve también macro y proveedores", () => {
    const matches = matchNewsToPortfolio(n, positions, perfiles, {
      plan: "elite",
    });
    expect(matches.some((m) => m.relation === "macro")).toBe(true);
    // AAPL y MSFT entran por directo; TSLA entra por macro (tasas).
    expect(matches).toHaveLength(3);
  });

  it("aplica el umbral minRelevance", () => {
    const cartera: Position[] = [
      { symbol: "AAPL", weight: 5 },
      { symbol: "MSFT", weight: 90 },
    ];
    const n2 = news({
      tickers: [
        { symbol: "AAPL", relation: "direct", confidence: 0.9 },
        { symbol: "MSFT", relation: "direct", confidence: 0.9 },
      ],
    });
    const matches = matchNewsToPortfolio(n2, cartera, profiles, {
      relations: ["direct"],
      minRelevance: 0.1,
    });
    expect(matches.map((m) => m.symbol)).toEqual(["MSFT"]);
  });

  it("una cartera vacía no devuelve nada", () => {
    expect(matchNewsToPortfolio(news(), [], profiles)).toEqual([]);
  });
});

describe("sin duplicados y tolerancia a datos sucios", () => {
  it("un símbolo que calza por directo, sector y macro aparece una sola vez", () => {
    const cartera: Position[] = [{ symbol: "AAPL", weight: 50 }];
    const perfiles = [
      profile("AAPL", { macroFactors: ["tasas"] }),
      profile("MSFT"),
    ];
    const n = news({
      title: "Rates rise and Apple beats estimates",
      tickers: [
        { symbol: "AAPL", relation: "direct", confidence: 1 },
        { symbol: "MSFT", relation: "direct", confidence: 1 },
      ],
    });
    const matches = matchNewsToPortfolio(n, cartera, perfiles, {
      relations: ["direct", "sector", "macro"],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].relation).toBe("direct");
  });

  it("no duplica aunque la noticia repita el mismo ticker", () => {
    const n = news({
      tickers: [
        { symbol: "AAPL", relation: "direct", confidence: 0.6 },
        { symbol: "AAPL", relation: "direct", confidence: 0.8 },
      ],
    });
    const matches = matchNewsToPortfolio(n, positions, profiles, {
      relations: ["direct"],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe(0.8);
  });

  it("tolera mayúsculas, espacios y perfiles faltantes", () => {
    const n = news({
      tickers: [{ symbol: " aapl ", relation: "direct", confidence: 1 }],
    });
    const matches = matchNewsToPortfolio(
      n,
      [{ symbol: "aapl", weight: 33.333333 }],
      [],
      { relations: ["direct"] },
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].symbol).toBe("AAPL");
    expect(matches[0].relevance).toBeCloseTo(0.33333333, 5);
  });
});

describe("exposurePct", () => {
  it("suma los pesos de las posiciones tocadas y nada más", () => {
    const n = news({
      tickers: [
        { symbol: "AAPL", relation: "direct", confidence: 1 },
        { symbol: "MSFT", relation: "direct", confidence: 1 },
        { symbol: "NVDA", relation: "direct", confidence: 1 },
      ],
    });
    expect(exposurePct(n, positions)).toBeCloseTo(50, 6);
  });

  it("sin tickers en la noticia la exposición es 0", () => {
    expect(exposurePct(news({ tickers: [] }), positions)).toBe(0);
  });
});

describe("diccionario macro", () => {
  it("cubre los seis temas en español e inglés", () => {
    const ids = MACRO_KEYWORDS.map((topic) => topic.id);
    expect(ids).toEqual(["tasa", "cobre", "litio", "dolar", "petroleo", "arancel"]);
    for (const topic of MACRO_KEYWORDS) {
      expect(topic.keywords.length).toBeGreaterThanOrEqual(2);
    }
  });
});
