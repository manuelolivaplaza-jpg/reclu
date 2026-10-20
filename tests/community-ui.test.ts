import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Páginas públicas /creadores y /creadores/[alias] (F50).
 *
 * Sin red y sin Supabase real: el cliente se reemplaza por un doble en
 * memoria con el mismo encadenado que usa la app. La comunidad solo existe
 * con COMMUNITY_ENABLED === "true".
 */

const NOT_FOUND = "NEXT_NOT_FOUND";

const state = vi.hoisted(() => ({
  profiles: [] as Record<string, unknown>[],
  portfolios: [] as Record<string, unknown>[],
  calls: [] as string[],
  fail: false,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
}));

vi.mock("next/server", () => ({
  connection: async () => {},
}));

vi.mock("@/components/site-header", () => ({
  SiteHeader: () => null,
}));

vi.mock("@/components/site-footer", () => ({
  SiteFooter: () => null,
}));

vi.mock("@/lib/supabase/server", () => {
  function makeBuilder(table: string) {
    const filters: Record<string, unknown> = {};

    const api = {
      select() {
        return api;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      async maybeSingle() {
        state.calls.push(`${table}:maybeSingle`);
        if (state.fail) {
          return { data: null, error: { message: "boom" } };
        }
        const match = state.profiles.find((row) =>
          Object.entries(filters).every(([key, value]) => row[key] === value),
        );
        return { data: match ?? null, error: null };
      },
      then(
        onFulfilled: (value: { data: unknown[]; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        state.calls.push(`${table}:select`);
        if (state.fail) {
          return Promise.resolve({
            data: [],
            error: { message: "boom" },
          }).then(onFulfilled, onRejected);
        }
        const rows =
          table === "creator_profiles" ? state.profiles : state.portfolios;
        const data = rows.filter((row) =>
          Object.entries(filters).every(([key, value]) => row[key] === value),
        );
        return Promise.resolve({ data, error: null }).then(
          onFulfilled,
          onRejected,
        );
      },
    };

    return api;
  }

  return {
    createClient: async () => ({ from: (table: string) => makeBuilder(table) }),
  };
});

import CreadoresPage from "@/app/creadores/page";
import CreatorPage, {
  generateMetadata,
  normalizeCreatorPortfolio,
  normalizeCreatorProfile,
} from "@/app/creadores/[alias]/page";

const ORIGINAL_FLAG = process.env.COMMUNITY_ENABLED;

const VERIFIED_PROFILE = {
  id: "11111111-1111-4111-a111-111111111111",
  alias: "manu-01",
  bio: "Comparto carteras de ejemplo con información pública.",
  verificado: true,
  conflicto_interes: "Trabajo en una corredora de bolsa.",
  declara_no_asesoria: true,
  created_at: "2026-01-05T12:00:00Z",
};

const APPROVED_PORTFOLIO = {
  id: "22222222-2222-4222-a222-222222222222",
  creator_id: VERIFIED_PROFILE.id,
  titulo: "Cartera defensiva",
  descripcion: "Solo información pública.",
  holdings: [
    { symbol: "AAPL", name: "Apple", weight: 12.5 },
    { symbol: "BCH", name: "Banco de Chile", weight: 25 },
  ],
  estado: "approved",
  created_at: "2026-02-10T12:00:00Z",
};

const REJECTED_PORTFOLIO = {
  id: "33333333-3333-4333-a333-333333333333",
  creator_id: VERIFIED_PROFILE.id,
  titulo: "Cartera rechazada",
  descripcion: "No debería publicarse.",
  holdings: [{ symbol: "TSLA", name: "Tesla", weight: 100 }],
  estado: "rejected",
  created_at: "2026-02-11T12:00:00Z",
};

function enabled(): void {
  process.env.COMMUNITY_ENABLED = "true";
}

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  state.profiles = [];
  state.portfolios = [];
  state.calls = [];
  state.fail = false;
  delete process.env.COMMUNITY_ENABLED;
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.COMMUNITY_ENABLED;
  else process.env.COMMUNITY_ENABLED = ORIGINAL_FLAG;
});

describe("páginas públicas de creadores: bandera y 404", () => {
  it("con la comunidad apagada ambas páginas dan 404 sin tocar la base", async () => {
    await expect(CreadoresPage()).rejects.toThrow(NOT_FOUND);
    await expect(
      CreatorPage({ params: Promise.resolve({ alias: "manu-01" }) }),
    ).rejects.toThrow(NOT_FOUND);
    expect(state.calls).toHaveLength(0);
  });

  it("un alias fuera del patrón da 404 sin consultar Supabase", async () => {
    enabled();
    for (const alias of ["Mayusculas", "ab", "con espacio", "_guion"]) {
      await expect(
        CreatorPage({ params: Promise.resolve({ alias }) }),
      ).rejects.toThrow(NOT_FOUND);
    }
    expect(state.calls).toHaveLength(0);
  });

  it("un perfil no verificado no se publica", async () => {
    enabled();
    state.profiles = [{ ...VERIFIED_PROFILE, verificado: false }];

    await expect(
      CreatorPage({ params: Promise.resolve({ alias: "manu-01" }) }),
    ).rejects.toThrow(NOT_FOUND);
    expect(state.calls).toEqual(["creator_profiles:maybeSingle"]);
  });

  it("un alias inexistente da 404", async () => {
    enabled();

    await expect(
      CreatorPage({ params: Promise.resolve({ alias: "nadie" }) }),
    ).rejects.toThrow(NOT_FOUND);
  });

  it("metadata no indexa con la comunidad apagada", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ alias: "manu-01" }),
    });
    expect(meta.robots).toMatchObject({ index: false });

    enabled();
    const on = await generateMetadata({
      params: Promise.resolve({ alias: "manu-01" }),
    });
    expect(String(on.title)).toContain("manu-01");
    expect(on.alternates?.canonical).toBe("/creadores/manu-01");
  });
});

describe("catálogo /creadores", () => {
  it("solo lista perfiles verificados y cuenta sus carteras", async () => {
    enabled();
    const publicProfile = {
      id: VERIFIED_PROFILE.id,
      alias: "manu-01",
      bio: VERIFIED_PROFILE.bio,
      verificado: true,
      conflicto_interes: VERIFIED_PROFILE.conflicto_interes,
    };
    // El join anida el perfil en cada fila, como devuelve Supabase.
    state.portfolios = [
      { ...APPROVED_PORTFOLIO, creator_profiles: publicProfile },
      {
        ...APPROVED_PORTFOLIO,
        id: "otra",
        titulo: "Segunda cartera",
        creator_profiles: publicProfile,
      },
      {
        ...APPROVED_PORTFOLIO,
        id: "oculta",
        creator_id: "otro",
        creator_profiles: {
          id: "otro",
          alias: "sin-verificar",
          bio: "",
          verificado: false,
          conflicto_interes: null,
        },
      },
    ];

    const html = render(await CreadoresPage());

    expect(html).toContain("manu-01");
    expect(html).toContain("2 carteras");
    expect(html).not.toContain("sin-verificar");
    expect(html).toContain("Contenido de terceros, no asesoría.");
    expect(html).toContain("Ley 21.521");
  });
});

describe("detalle /creadores/[alias]", () => {
  it("muestra perfil, carteras aprobadas y el aviso de terceros", async () => {
    enabled();
    state.profiles = [VERIFIED_PROFILE];
    state.portfolios = [APPROVED_PORTFOLIO, REJECTED_PORTFOLIO];

    const html = render(
      await CreatorPage({ params: Promise.resolve({ alias: "manu-01" }) }),
    );

    expect(html).toContain("manu-01");
    expect(html).toContain(VERIFIED_PROFILE.bio);
    expect(html).toContain("Conflicto de interés declarado.");
    expect(html).toContain(VERIFIED_PROFILE.conflicto_interes);
    expect(html).toContain("Contenido de terceros, no asesoría.");
    expect(html).toContain("No ejecutamos órdenes");
    expect(html).toContain("Ley 21.521");

    expect(html).toContain("Cartera defensiva");
    expect(html).toContain("AAPL");
    expect(html).toContain("Banco de Chile");
    expect(html).toContain("12,5%");
    expect(html).toContain("Total declarado: 37,5%");

    // La cartera rechazada nunca se renderiza, aunque esté en la base.
    expect(html).not.toContain("Cartera rechazada");
    expect(html).not.toContain("TSLA");
  });

  it("con un error de Supabase muestra aviso y no filtra datos", async () => {
    enabled();
    state.fail = true;

    const html = render(
      await CreatorPage({ params: Promise.resolve({ alias: "manu-01" }) }),
    );

    expect(html).toContain("No pudimos cargar este perfil");
    expect(html).not.toContain(VERIFIED_PROFILE.bio);
    expect(html).not.toContain("Cartera defensiva");
    expect(html).toContain("Ley 21.521");
  });

  it("avisa cuando el perfil no tiene carteras aprobadas", async () => {
    enabled();
    state.profiles = [VERIFIED_PROFILE];

    const html = render(
      await CreatorPage({ params: Promise.resolve({ alias: "manu-01" }) }),
    );

    expect(html).toContain("todavía no tiene carteras aprobadas");
  });
});

describe("normalización defensiva de datos", () => {
  it("rechaza perfiles sin alias válido o sin verificación", () => {
    expect(normalizeCreatorProfile(null)).toBeNull();
    expect(normalizeCreatorProfile("texto")).toBeNull();
    expect(
      normalizeCreatorProfile({ ...VERIFIED_PROFILE, alias: "Mayusculas" }),
    ).toBeNull();
    expect(
      normalizeCreatorProfile({ ...VERIFIED_PROFILE, verificado: false }),
    ).toBeNull();
    expect(normalizeCreatorProfile(VERIFIED_PROFILE)).toMatchObject({
      alias: "manu-01",
      verificado: true,
      declaraNoAsesoria: true,
    });
  });

  it("descarta carteras con holdings inválidos", () => {
    expect(normalizeCreatorPortfolio(null)).toBeNull();
    expect(
      normalizeCreatorPortfolio({
        ...APPROVED_PORTFOLIO,
        holdings: [{ symbol: "AAPL", weight: 120 }],
      }),
    ).toBeNull();
    expect(
      normalizeCreatorPortfolio({ ...APPROVED_PORTFOLIO, holdings: [] }),
    ).toBeNull();
    expect(
      normalizeCreatorPortfolio({ ...APPROVED_PORTFOLIO, titulo: "ab" }),
    ).toBeNull();

    expect(normalizeCreatorPortfolio(APPROVED_PORTFOLIO)).toMatchObject({
      titulo: "Cartera defensiva",
      holdings: [
        { symbol: "AAPL", name: "Apple", weight: 12.5 },
        { symbol: "BCH", name: "Banco de Chile", weight: 25 },
      ],
    });
  });
});
