import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_PORTFOLIOS,
  HIDDEN_DEMO_SLUGS,
  demoPortfolioBySlug,
  demoRedirectTarget,
  isHiddenSlug,
} from "@/lib/demo-data";

/**
 * `@/lib/supabase/server` llama a `cookies()` de Next, que revienta fuera de
 * un request scope. Se mockea para que el test sea hermético: no depende de si
 * el entorno tiene `.env.local` apuntando a un Supabase real.
 */
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getPortfolioRedirect } from "@/lib/queries";

const HIDDEN = Object.keys(HIDDEN_DEMO_SLUGS);

type FakeRow = { slug: string; replaced_by_slug?: string | null; is_active?: boolean };

type FakeBuilder = {
  select: () => FakeBuilder;
  eq: (column: string, value: unknown) => FakeBuilder;
  maybeSingle: () => Promise<{ data: FakeRow | null; error: { message: string } | null }>;
};

/** Cliente Supabase mínimo: filtra por `slug` y por `is_active` como la RLS. */
function fakeSupabase(rows: Record<string, FakeRow>, errorMessage?: string) {
  const makeBuilder = (): FakeBuilder => {
    const filters: Record<string, unknown> = {};
    const builder: FakeBuilder = {
      select: () => builder,
      eq: (column, value) => {
        filters[column] = value;
        return builder;
      },
      maybeSingle: async () => {
        if (errorMessage) return { data: null, error: { message: errorMessage } };
        const row = rows[filters.slug as string];
        if (!row) return { data: null, error: null };
        // La consulta del destino añade `.eq("is_active", true)`.
        if ("is_active" in filters && row.is_active !== filters.is_active) {
          return { data: null, error: null };
        }
        return { data: row, error: null };
      },
    };
    return builder;
  };
  return { from: () => makeBuilder() };
}

beforeEach(() => {
  mocks.createClient.mockReset();
  // Por defecto: sin request scope, como en un test unitario.
  mocks.createClient.mockRejectedValue(
    new Error("`cookies` was called outside a request scope"),
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("portafolios ocultos (demo)", () => {
  it("mapea los 4 slugs con cifras inventadas a su versión real", () => {
    expect(HIDDEN_DEMO_SLUGS).toEqual({
      "elon-doge-tracker": "musk-dice",
      "trump-truth-signals": "trump-dice",
      "afp-consenso-chile": "afp-modelo-acciones-cl",
      "inverse-cramer": "inverse-cramer-real",
      "afp-multifondos": "afp-consenso-chile",
    });
  });

  it("getPortfolioBySlug los excluye", () => {
    for (const slug of HIDDEN) {
      expect(isHiddenSlug(slug)).toBe(true);
      expect(demoPortfolioBySlug(slug)).toBeNull();
    }
  });

  it("redirige al real cuando existe en los datos demo", () => {
    expect(demoRedirectTarget("elon-doge-tracker")).toBe("musk-dice");
    expect(demoRedirectTarget("trump-truth-signals")).toBe("trump-dice");
    expect(demoRedirectTarget("inverse-cramer")).toBe("inverse-cramer-real");
  });

  it("devuelve null cuando el real no existe en demo", () => {
    // afp-modelo-acciones-cl no está en los datos demo.
    expect(demoRedirectTarget("afp-consenso-chile")).toBeNull();
  });

  it("devuelve null para slugs no ocultos", () => {
    expect(isHiddenSlug("pelosi-tracker")).toBe(false);
    expect(demoRedirectTarget("pelosi-tracker")).toBeNull();
  });

  it("solo reconoce los slugs propios del mapa, no propiedades heredadas", () => {
    for (const valor of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(isHiddenSlug(valor)).toBe(false);
      expect(demoRedirectTarget(valor)).toBeNull();
    }
  });

  it("un portafolio activo del catálogo no redirige nunca", async () => {
    const activos = DEMO_PORTFOLIOS.filter((p) => !isHiddenSlug(p.slug)).slice(0, 3);
    expect(activos.length).toBeGreaterThan(0);
    for (const portfolio of activos) {
      expect(demoPortfolioBySlug(portfolio.slug)).not.toBeNull();
      expect(await getPortfolioRedirect(portfolio.slug)).toBeNull();
    }
  });

  it("los ocultos no aparecen en el listado demo", () => {
    const listado = DEMO_PORTFOLIOS.filter((p) => !isHiddenSlug(p.slug)).map((p) => p.slug);
    for (const slug of HIDDEN) {
      expect(listado).not.toContain(slug);
    }
  });

  it("los reemplazos reales existen en demo", () => {
    expect(demoPortfolioBySlug("musk-dice")).not.toBeNull();
    expect(demoPortfolioBySlug("trump-dice")).not.toBeNull();
    expect(demoPortfolioBySlug("inverse-cramer-real")).not.toBeNull();
  });

  it("getPortfolioRedirect (sin Supabase) resuelve igual que el mapa demo", async () => {
    // Sin URL configurada, aunque el entorno tenga `.env.local` con Supabase.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(await getPortfolioRedirect("trump-truth-signals")).toBe("trump-dice");
    expect(await getPortfolioRedirect("elon-doge-tracker")).toBe("musk-dice");
    expect(await getPortfolioRedirect("inverse-cramer")).toBe("inverse-cramer-real");
    // Real inexistente en demo -> null.
    expect(await getPortfolioRedirect("afp-consenso-chile")).toBeNull();
    // No oculto -> null.
    expect(await getPortfolioRedirect("pelosi-tracker")).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("con Supabase vivo prioriza replaced_by_slug y exige destino activo", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ejemplo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    mocks.createClient.mockResolvedValue(
      fakeSupabase({
        "trump-truth-signals": {
          slug: "trump-truth-signals",
          replaced_by_slug: "trump-dice-v2",
          is_active: false,
        },
        "trump-dice-v2": { slug: "trump-dice-v2", is_active: true },
        "elon-doge-tracker": {
          slug: "elon-doge-tracker",
          replaced_by_slug: "musk-dice",
          is_active: false,
        },
        "musk-dice": { slug: "musk-dice", is_active: false },
      }),
    );

    // La fila manda sobre el mapa estático y el destino activo se respeta.
    expect(await getPortfolioRedirect("trump-truth-signals")).toBe("trump-dice-v2");
    // Destino inactivo -> no redirige.
    expect(await getPortfolioRedirect("elon-doge-tracker")).toBeNull();
  });

  it("si Supabase lanza (sin request scope) devuelve el fallback sin lanzar", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ejemplo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    await expect(getPortfolioRedirect("trump-truth-signals")).resolves.toBe("trump-dice");
    await expect(getPortfolioRedirect("inverse-cramer")).resolves.toBe("inverse-cramer-real");
    // El mapa estático apunta al real aunque no esté en los datos demo.
    await expect(getPortfolioRedirect("afp-consenso-chile")).resolves.toBe(
      "afp-modelo-acciones-cl",
    );
    // No oculto: ni siquiera crea el cliente.
    await expect(getPortfolioRedirect("pelosi-tracker")).resolves.toBeNull();
    expect(mocks.createClient).toHaveBeenCalledTimes(3);
  });

  it("si la consulta devuelve error de Supabase cae al fallback sin lanzar", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ejemplo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    // supabase-js no lanza en fallos de red: devuelve `{ data: null, error }`.
    mocks.createClient.mockResolvedValue(fakeSupabase({}, "TypeError: fetch failed"));

    await expect(getPortfolioRedirect("elon-doge-tracker")).resolves.toBe("musk-dice");
    await expect(getPortfolioRedirect("afp-consenso-chile")).resolves.toBe(
      "afp-modelo-acciones-cl",
    );
  });
});
