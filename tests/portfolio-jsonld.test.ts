import { describe, expect, it } from "vitest";
import { BRAND_NAME } from "@/lib/brand";
import {
  buildPortfolioDataset,
  portfolioTemporalCoverage,
  type PortfolioDatasetInput,
} from "@/components/portfolio/portfolio-view";

/**
 * B3/T3: el Dataset JSON-LD de la ficha declara a Fraccion como creador (no al
 * gestor), una cobertura temporal con fechas reales (nunca el año en curso) y
 * `dateModified` solo si hay `updated_at`. La función es pura: recibe todo
 * explícito y no toca env ni React.
 */

const BASE_URL = "https://fraccion.si";

function fixture(overrides: Partial<PortfolioDatasetInput> = {}): PortfolioDatasetInput {
  return {
    slug: "nancy-pelosi",
    name: "Nancy Pelosi",
    description: "Operaciones declaradas por la congresista en sus PTR.",
    category: "political_us",
    categoryLabel: "Políticos EE.UU.",
    tags: ["congreso", "PTR"],
    manager: "Nancy Pelosi",
    source: "house_disclosure",
    updatedAt: "2026-10-30T14:05:00.000Z",
    licenseUrl: `${BASE_URL}/disclaimer`,
    baseUrl: BASE_URL,
    brandName: BRAND_NAME,
    dates: ["2026-10-30", "2025-05-02", "2025-08-14"],
    ...overrides,
  };
}

/** Rutas con valores vacíos (null, undefined, "" o "   ") en un objeto anidado. */
function emptyFields(value: unknown, path = "$"): string[] {
  if (value === null || value === undefined) return [path];
  if (typeof value === "string") return value.trim() === "" ? [path] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => emptyFields(item, `${path}[${index}]`));
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
      emptyFields(item, `${path}.${key}`),
    );
  }
  return [];
}

describe("Dataset JSON-LD de la ficha (B3)", () => {
  it("el creador es Fraccion (Organization con @id), no el gestor", () => {
    const data = buildPortfolioDataset(fixture());

    expect(data["@type"]).toBe("Dataset");
    expect(data.creator).toEqual({
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`,
      name: BRAND_NAME,
    });
    // El gestor de la cartera nunca se declara como creador del dataset.
    expect(JSON.stringify(data.creator)).not.toContain("Person");
    expect(JSON.stringify(data.creator)).not.toContain("Nancy Pelosi");
    // El gestor va en `about` y sí es una persona en este caso.
    expect(data.about).toEqual({ "@type": "Person", name: "Nancy Pelosi" });
  });

  it("temporalCoverage es un intervalo ISO de fechas reales, no el año suelto", () => {
    const data = buildPortfolioDataset(fixture());

    expect(data.temporalCoverage).toBe("2025-05-02/2026-10-30");
    expect(String(data.temporalCoverage)).toMatch(/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/);
    // El bug anterior publicaba solo el año en curso ("2026").
    expect(String(data.temporalCoverage)).not.toMatch(/^\d{4}$/);
  });

  it("omite temporalCoverage cuando no hay fechas reales", () => {
    const data = buildPortfolioDataset(fixture({ dates: [] }));

    expect(data).not.toHaveProperty("temporalCoverage");
    expect(JSON.stringify(data)).not.toContain("undefined");
  });

  it("dateModified sale de updated_at y se omite si falta", () => {
    expect(buildPortfolioDataset(fixture()).dateModified).toBe("2026-10-30T14:05:00.000Z");
    expect(buildPortfolioDataset(fixture({ updatedAt: null }))).not.toHaveProperty("dateModified");
    expect(buildPortfolioDataset(fixture({ updatedAt: "  " }))).not.toHaveProperty("dateModified");
  });

  it("tipa al gestor: Person, Organization o Thing si no se puede saber", () => {
    const fondo = buildPortfolioDataset(
      fixture({
        slug: "puente",
        category: "hedge_fund",
        categoryLabel: "Hedge Funds",
        manager: "Bridgewater Associates",
        source: "sec13f",
      }),
    );
    expect(fondo.about).toEqual({ "@type": "Organization", name: "Bridgewater Associates" });

    const desconocido = buildPortfolioDataset(
      fixture({
        slug: "cartera-x",
        category: "thematic",
        manager: "Equipo Fraccion",
        source: "model_portfolio",
      }),
    );
    expect(desconocido.about).toEqual({ "@type": "Thing", name: "Equipo Fraccion" });
  });

  it("no emite campos vacíos ni textos en blanco", () => {
    const data = buildPortfolioDataset(
      fixture({
        name: "Cartera sin datos",
        description: "",
        tags: [],
        manager: null,
        dates: null,
        updatedAt: undefined,
        categoryLabel: "Hedge Funds",
      }),
    );

    expect(emptyFields(data)).toEqual([]);
    expect(data).not.toHaveProperty("description");
    expect(data).not.toHaveProperty("about");
    expect(data).not.toHaveProperty("temporalCoverage");
    expect(data).not.toHaveProperty("dateModified");
    expect(data.name).toBe("Cartera sin datos");
    expect(data.url).toBe(`${BASE_URL}/portfolio/nancy-pelosi`);
    expect(data.license).toBe(`${BASE_URL}/disclaimer`);
    expect(data.inLanguage).toBe("es-CL");
    expect(data.keywords).toBe("Hedge Funds");
  });

  it("keywords no repite la etiqueta de categoría", () => {
    const data = buildPortfolioDataset(
      fixture({ tags: ["Políticos EE.UU.", "PTR", "congreso", "congreso"] }),
    );

    expect(data.keywords).toBe("Políticos EE.UU., PTR, congreso");
  });
});

describe("portfolioTemporalCoverage", () => {
  it("ordena, normaliza timestamps y descarta fechas inválidas", () => {
    expect(
      portfolioTemporalCoverage([
        "2026-10-30T14:05:00.000Z",
        "2025-05-02",
        "no-es-fecha",
        "2026-02-31",
        null,
        undefined,
        "",
      ]),
    ).toBe("2025-05-02/2026-10-30");
  });

  it("devuelve null sin datos y acepta un solo día", () => {
    expect(portfolioTemporalCoverage([])).toBeNull();
    expect(portfolioTemporalCoverage(null)).toBeNull();
    expect(portfolioTemporalCoverage(["2026-01-05"])).toBe("2026-01-05/2026-01-05");
  });
});
