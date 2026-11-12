import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAccionGate,
  accionSymbolFromPath,
  isUnknownAccionSymbol,
} from "@/lib/accion-gate";

/**
 * B1/T3 — gate de /accion en el proxy.
 *
 * Sin red: `fetch` se reemplaza por un doble que responde como PostgREST
 * (holdings y ticker_profile). Reglas: solo se bloquea un símbolo cuando el
 * catálogo respondió con datos y el símbolo no está en ninguna de las dos
 * fuentes. Catálogo vacío, error o falta de service key => deja pasar.
 */

const state = vi.hoisted(() => ({
  holdings: [] as { portfolio_id: string; symbol: string }[],
  profiles: [] as { symbol: string; sector?: string | null }[],
  fail: false,
  calls: [] as string[],
}));

function installFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      state.calls.push(`${url.pathname}${url.search}`);
      if (state.fail) throw new Error("red");
      const limit = Number(url.searchParams.get("limit") ?? "") || 1000;

      if (url.pathname.endsWith("/rest/v1/holdings")) {
        const filter = url.searchParams.get("symbol");
        let rows = state.holdings;
        if (filter?.startsWith("ilike.")) {
          const wanted = filter.slice("ilike.".length).toUpperCase();
          rows = rows.filter((row) => row.symbol.toUpperCase() === wanted);
        }
        return new Response(JSON.stringify(rows.slice(0, limit)), { status: 200 });
      }

      if (url.pathname.endsWith("/rest/v1/ticker_profile")) {
        const filter = url.searchParams.get("symbol");
        let rows = state.profiles;
        if (filter?.startsWith("eq.")) {
          const wanted = filter.slice("eq.".length).toUpperCase();
          rows = rows.filter((row) => row.symbol.toUpperCase() === wanted);
        }
        return new Response(JSON.stringify(rows.slice(0, limit)), { status: 200 });
      }

      return new Response("[]", { status: 200 });
    }),
  );
}

const env = { ...process.env };

beforeEach(() => {
  __resetAccionGate();
  state.holdings = [];
  state.profiles = [];
  state.fail = false;
  state.calls = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  installFetch();
});

afterEach(() => {
  process.env = { ...env };
  vi.unstubAllGlobals();
});

describe("accionSymbolFromPath", () => {
  it("solo toma /accion/<x> de un segmento", () => {
    expect(accionSymbolFromPath("/accion/nvda")).toBe("nvda");
    expect(accionSymbolFromPath("/accion/NVDA/")).toBe("NVDA");
    expect(accionSymbolFromPath("/accion/sqm-b")).toBe("sqm-b");
    expect(accionSymbolFromPath("/accion/nvda/opengraph-image")).toBeNull();
    expect(accionSymbolFromPath("/accion")).toBeNull();
    expect(accionSymbolFromPath("/acciones/nvda")).toBeNull();
    expect(accionSymbolFromPath("/portfolio/nvda")).toBeNull();
    expect(accionSymbolFromPath("/")).toBeNull();
  });
});

describe("isUnknownAccionSymbol", () => {
  it("un ticker con filas en holdings nunca es desconocido", async () => {
    state.holdings = [
      { portfolio_id: "p1", symbol: "NVDA" },
      { portfolio_id: "p2", symbol: "NVDA" },
    ];
    expect(await isUnknownAccionSymbol("nvda")).toBe(false);
    expect(await isUnknownAccionSymbol(" NVDA ")).toBe(false);
  });

  it("un símbolo que no está ni en holdings ni en ticker_profile da 404", async () => {
    state.holdings = [{ portfolio_id: "p1", symbol: "NVDA" }];
    expect(await isUnknownAccionSymbol("ZZZZ")).toBe(true);
  });

  it("un ticker solo curado en ticker_profile tampoco da 404", async () => {
    state.holdings = [{ portfolio_id: "p1", symbol: "NVDA" }];
    state.profiles = [{ symbol: "KO", sector: "Consumo" }];
    expect(await isUnknownAccionSymbol("ko")).toBe(false);
  });

  it("catálogo vacío deja pasar (staging sin seed)", async () => {
    expect(await isUnknownAccionSymbol("ZZZZ")).toBe(false);
  });

  it("un error de red deja pasar", async () => {
    state.holdings = [{ portfolio_id: "p1", symbol: "NVDA" }];
    state.fail = true;
    expect(await isUnknownAccionSymbol("ZZZZ")).toBe(false);
  });

  it("sin service key deja pasar (holdings está tras el muro 012)", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    state.holdings = [{ portfolio_id: "p1", symbol: "NVDA" }];
    expect(await isUnknownAccionSymbol("ZZZZ")).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it("sin Supabase configurado deja pasar", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    expect(await isUnknownAccionSymbol("ZZZZ")).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it("cachea el veredicto por símbolo durante 5 minutos", async () => {
    state.holdings = [{ portfolio_id: "p1", symbol: "NVDA" }];
    expect(await isUnknownAccionSymbol("ZZZZ")).toBe(true);
    const calls = state.calls.length;
    expect(await isUnknownAccionSymbol("zzzz")).toBe(true);
    expect(state.calls.length).toBe(calls);
  });

  it("no consulta la red con la caché de catálogo ya tibia y un símbolo conocido", async () => {
    state.holdings = [{ portfolio_id: "p1", symbol: "NVDA" }];
    await isUnknownAccionSymbol("NVDA");
    expect(state.calls.length).toBeGreaterThan(0);
    const calls = state.calls.length;
    await isUnknownAccionSymbol("NVDA");
    expect(state.calls.length).toBe(calls);
  });
});
