import { describe, expect, it } from "vitest";
import {
  DEMO_PORTFOLIOS,
  HIDDEN_DEMO_SLUGS,
  demoPortfolioBySlug,
  demoRedirectTarget,
  isHiddenSlug,
} from "@/lib/demo-data";
import { getPortfolioRedirect } from "@/lib/queries";

const HIDDEN = Object.keys(HIDDEN_DEMO_SLUGS);

describe("portafolios ocultos (demo)", () => {
  it("mapea los 4 slugs con cifras inventadas a su versión real", () => {
    expect(HIDDEN_DEMO_SLUGS).toEqual({
      "elon-doge-tracker": "musk-dice",
      "trump-truth-signals": "trump-dice",
      "afp-consenso-chile": "afp-modelo-acciones-cl",
      "inverse-cramer": "inverse-cramer-real",
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
    expect(await getPortfolioRedirect("trump-truth-signals")).toBe("trump-dice");
    expect(await getPortfolioRedirect("elon-doge-tracker")).toBe("musk-dice");
    expect(await getPortfolioRedirect("inverse-cramer")).toBe("inverse-cramer-real");
    // Real inexistente en demo -> null.
    expect(await getPortfolioRedirect("afp-consenso-chile")).toBeNull();
    // No oculto -> null.
    expect(await getPortfolioRedirect("pelosi-tracker")).toBeNull();
  });
});
