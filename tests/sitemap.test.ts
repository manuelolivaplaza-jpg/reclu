import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sitemap: rutas estáticas, tickers reales y portafolios canónicos.
 *
 * Sin red ni Supabase. Se reemplazan las dos lecturas de datos:
 * - `getKnownTickerSymbols` (B1) por una lista fija en MAYÚSCULAS, como la
 *   devuelve el contrato (ordenada por portfolioCount desc).
 * - `getPortfolios` por un doble mínimo del que cuelga el fallback de
 *   `getSitemapPortfolios` cuando no hay Supabase.
 * `isLegacyPortfolioSlug` (B7) se usa real: es un mapa puro y sin imports.
 *
 * Los flags se leen en cada llamada, no al importar el módulo.
 */

const tickerFixture = vi.hoisted(() => [
  { symbol: "NVDA", portfolioCount: 9 },
  { symbol: "SQM-B", portfolioCount: 4 },
  { symbol: "BRK-B", portfolioCount: 2 },
  { symbol: "TSLA", portfolioCount: 1 },
]);

const tickerState = vi.hoisted(() => ({
  symbols: [] as { symbol: string; portfolioCount: number }[],
}));

vi.mock("@/lib/public-tickers", () => ({
  getKnownTickerSymbols: async () => tickerState.symbols,
}));

vi.mock("@/lib/queries", () => ({
  getPortfolios: async () => [
    {
      slug: "pelosi-tracker",
      name: "Pelosi Tracker",
      updated_at: "2026-10-20T12:00:00Z",
    },
    // Slugs viejos: siguen en la base, pero su URL ya no es la canónica.
    {
      slug: "scion-asset-management",
      name: "Scion (slug viejo)",
      updated_at: "2026-10-21T12:00:00Z",
    },
    {
      slug: "bridgewater-all-weather",
      name: "Bridgewater (slug viejo)",
      updated_at: "2026-10-22T12:00:00Z",
    },
    // Slugs canónicos.
    {
      slug: "scion-13f",
      name: "Scion 13F",
      updated_at: "2026-10-23T12:00:00Z",
    },
    {
      slug: "bridgewater-13f",
      name: "Bridgewater 13F",
      updated_at: "2026-10-24T12:00:00Z",
    },
  ],
}));

import sitemap from "@/app/sitemap";
import { FICHAS_APRENDE } from "@/content/aprende";
import {
  MAX_SITEMAP_TICKERS,
  SITEMAP_STATIC_LAST_MODIFIED,
} from "@/lib/sitemap-data";

const ORIGINAL_API_FLAG = process.env.API_PUBLIC_ENABLED;
const ORIGINAL_COMMUNITY_FLAG = process.env.COMMUNITY_ENABLED;
const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

type SitemapEntry = Awaited<ReturnType<typeof sitemap>>[number];

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function paths(entries: Awaited<ReturnType<typeof sitemap>>): string[] {
  return entries
    .map((entry) => new URL(entry.url).pathname)
    .sort();
}

/** Rutas `/accion/*` en el orden en que las emite el sitemap. */
function tickerPaths(entries: SitemapEntry[]): string[] {
  return entries
    .map((entry) => new URL(entry.url).pathname)
    .filter((path) => path.startsWith("/accion/"));
}

/**
 * `lastModified` puede ser Date o string según el tipo de Next; el sitemap
 * emite Date, y así el test lo compara en ISO sin depender de la forma.
 */
function lastModifiedIso(entry: SitemapEntry | undefined): string | undefined {
  const value = entry?.lastModified;
  if (value === undefined) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

beforeEach(() => {
  delete process.env.API_PUBLIC_ENABLED;
  delete process.env.COMMUNITY_ENABLED;
  // Sin Supabase: `getSitemapPortfolios` usa el fallback (`getPortfolios`,
  // mockeado arriba). Así el test no depende de la red ni de un .env local.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  tickerState.symbols = [...tickerFixture];
});

afterEach(() => {
  restore("API_PUBLIC_ENABLED", ORIGINAL_API_FLAG);
  restore("COMMUNITY_ENABLED", ORIGINAL_COMMUNITY_FLAG);
  restore("NEXT_PUBLIC_SUPABASE_URL", ORIGINAL_SUPABASE_URL);
  tickerState.symbols = [];
  vi.useRealTimers();
});

describe("sitemap", () => {
  it("lista ranking, aprende, herramientas, medios, metodologia y trump-dice", async () => {
    const list = paths(await sitemap());

    expect(list).toContain("/ranking");
    expect(list).toContain("/aprende");
    expect(list).toContain("/herramientas");
    expect(list).toContain("/herramientas/backtest");
    expect(list).toContain("/herramientas/impuestos");
    expect(list).toContain("/medios");
    expect(list).toContain("/metodologia");
    expect(list).toContain("/trump-dice");
    for (const ficha of FICHAS_APRENDE) {
      expect(list).toContain(`/aprende/${ficha.slug}`);
    }
  });

  it("lista los tickers reales en minúsculas y en el orden de portfolioCount", async () => {
    const entries = await sitemap();

    expect(tickerPaths(entries)).toEqual([
      "/accion/nvda",
      "/accion/sqm-b",
      "/accion/brk-b",
      "/accion/tsla",
    ]);
    // Nada de la lista fija que se usaba antes: un símbolo solo entra si el
    // dato real lo trae.
    expect(tickerPaths(entries)).not.toContain("/accion/aapl");
    expect(tickerPaths(entries)).not.toContain("/accion/googl");
    expect(tickerPaths(entries)).not.toContain("/accion/meta");
  });

  it("normaliza el símbolo: minúsculas, sin espacios, sin duplicados ni rutas rotas", async () => {
    tickerState.symbols = [
      { symbol: "NVDA", portfolioCount: 9 },
      { symbol: "nvda", portfolioCount: 9 },
      { symbol: "  NVDA  ", portfolioCount: 9 },
      { symbol: "  ", portfolioCount: 0 },
      { symbol: "A/B", portfolioCount: 0 },
      { symbol: "SQM-B", portfolioCount: 3 },
    ];

    const entries = await sitemap();

    expect(tickerPaths(entries)).toEqual(["/accion/nvda", "/accion/sqm-b"]);
    const list = paths(entries);
    expect(new Set(list).size).toBe(list.length);
  });

  it("corta los tickers en MAX_SITEMAP_TICKERS", async () => {
    tickerState.symbols = Array.from(
      { length: MAX_SITEMAP_TICKERS + 25 },
      (_, index) => ({
        symbol: `T${String(index).padStart(4, "0")}`,
        portfolioCount: MAX_SITEMAP_TICKERS + 25 - index,
      }),
    );

    const tickers = tickerPaths(await sitemap());

    expect(tickers).toHaveLength(MAX_SITEMAP_TICKERS);
    expect(tickers[0]).toBe("/accion/t0000");
    expect(tickers).not.toContain(`/accion/t${MAX_SITEMAP_TICKERS}`);
  });

  it("incluye los portafolios activos y no repite rutas", async () => {
    const list = paths(await sitemap());

    expect(list).toContain("/portfolio/pelosi-tracker");
    expect(new Set(list).size).toBe(list.length);
  });

  it("no lista slugs viejos y sí sus canónicos", async () => {
    const list = paths(await sitemap());

    expect(list).not.toContain("/portfolio/scion-asset-management");
    expect(list).not.toContain("/portfolio/bridgewater-all-weather");
    expect(list).toContain("/portfolio/scion-13f");
    expect(list).toContain("/portfolio/bridgewater-13f");
  });

  it("las estáticas llevan la fecha fija y los portafolios su updated_at", async () => {
    const entries = await sitemap();
    const byPath = new Map<string, SitemapEntry>(
      entries.map(
        (entry): [string, SitemapEntry] => [
          new URL(entry.url).pathname,
          entry,
        ],
      ),
    );
    const fixed = new Date(SITEMAP_STATIC_LAST_MODIFIED).toISOString();

    for (const path of [
      "/",
      "/explore",
      "/metodologia",
      "/trump-dice",
      "/aprende",
    ]) {
      expect(lastModifiedIso(byPath.get(path)), path).toBe(fixed);
    }
    // El portafolio sigue anunciando la fecha del dato.
    expect(lastModifiedIso(byPath.get("/portfolio/pelosi-tracker"))).toBe(
      "2026-10-20T12:00:00.000Z",
    );
    // El ticker no tiene updated_at propio: no se inventa fecha.
    expect(byPath.get("/accion/nvda")?.lastModified).toBeUndefined();
  });

  it("no publica la hora del request en las rutas estáticas", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-03-01T09:30:00Z"));

    const entries = await sitemap();
    const explore = entries.find(
      (entry) => new URL(entry.url).pathname === "/explore",
    );

    expect(lastModifiedIso(explore)).toBe(
      new Date(SITEMAP_STATIC_LAST_MODIFIED).toISOString(),
    );
  });

  it("apagado por defecto: sin /api-docs ni /creadores", async () => {
    const list = paths(await sitemap());

    expect(list).not.toContain("/api-docs");
    expect(list).not.toContain("/creadores");
  });

  it("API_PUBLIC_ENABLED=true agrega /api-docs y no /creadores", async () => {
    process.env.API_PUBLIC_ENABLED = "true";
    const list = paths(await sitemap());

    expect(list).toContain("/api-docs");
    expect(list).not.toContain("/creadores");
  });

  it("COMMUNITY_ENABLED=true agrega /creadores y no /api-docs", async () => {
    process.env.COMMUNITY_ENABLED = "true";
    const list = paths(await sitemap());

    expect(list).toContain("/creadores");
    expect(list).not.toContain("/api-docs");
  });

  it("con ambos flags en true agrega las dos rutas", async () => {
    process.env.API_PUBLIC_ENABLED = "true";
    process.env.COMMUNITY_ENABLED = "true";
    const list = paths(await sitemap());

    expect(list).toContain("/api-docs");
    expect(list).toContain("/creadores");
  });

  it("falla cerrado: solo el valor exacto 'true' enciende las rutas", async () => {
    for (const value of ["TRUE", "1", "yes", ""]) {
      process.env.API_PUBLIC_ENABLED = value;
      process.env.COMMUNITY_ENABLED = value;
      const list = paths(await sitemap());

      expect(list, `flag=${value}`).not.toContain("/api-docs");
      expect(list, `flag=${value}`).not.toContain("/creadores");
    }
  });
});
