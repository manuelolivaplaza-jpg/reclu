import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LEGACY_PORTFOLIO_SLUGS,
  canonicalPortfolioSlug,
  isLegacyPortfolioSlug,
} from "@/lib/portfolio-canonical";

/**
 * B7 / T3: los 6 pares duplicados de la evidencia. El canónico es siempre la
 * versión `-13f` (la que se queda indexada); el slug viejo solo redirige.
 */
const PAIRS: [string, string][] = [
  ["scion-asset-management", "scion-13f"],
  ["duquesne-family-office", "duquesne-13f"],
  ["mubadala-sovereign", "mubadala-13f"],
  ["pif-saudi", "pif-13f"],
  ["softbank-vision", "softbank-13f"],
  ["bridgewater-all-weather", "bridgewater-13f"],
];

describe("mapa de slugs duplicados", () => {
  it("contiene exactamente los 6 pares de la evidencia", () => {
    expect(LEGACY_PORTFOLIO_SLUGS).toEqual({
      "scion-asset-management": "scion-13f",
      "duquesne-family-office": "duquesne-13f",
      "mubadala-sovereign": "mubadala-13f",
      "pif-saudi": "pif-13f",
      "softbank-vision": "softbank-13f",
      "bridgewater-all-weather": "bridgewater-13f",
    });
    expect(Object.keys(LEGACY_PORTFOLIO_SLUGS)).toHaveLength(6);
  });

  it.each(PAIRS)("reconoce %s y lo canoniza a %s", (legacy, canonical) => {
    expect(isLegacyPortfolioSlug(legacy)).toBe(true);
    expect(canonicalPortfolioSlug(legacy)).toBe(canonical);
  });

  it("no marca como viejos los slugs canónicos", () => {
    for (const [, canonical] of PAIRS) {
      expect(isLegacyPortfolioSlug(canonical)).toBe(false);
    }
  });

  it("canonicalPortfolioSlug es idempotente", () => {
    for (const [, canonical] of PAIRS) {
      expect(canonicalPortfolioSlug(canonical)).toBe(canonical);
      expect(canonicalPortfolioSlug(canonicalPortfolioSlug(canonical))).toBe(canonical);
    }
    for (const [legacy, canonical] of PAIRS) {
      expect(canonicalPortfolioSlug(canonicalPortfolioSlug(legacy))).toBe(canonical);
    }
  });

  it("un slug que no está en el mapa se devuelve tal cual", () => {
    expect(canonicalPortfolioSlug("pelosi-tracker")).toBe("pelosi-tracker");
    expect(isLegacyPortfolioSlug("pelosi-tracker")).toBe(false);
    expect(canonicalPortfolioSlug("")).toBe("");
  });

  it("no confunde propiedades heredadas con slugs viejos", () => {
    for (const heredado of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(isLegacyPortfolioSlug(heredado)).toBe(false);
      expect(canonicalPortfolioSlug(heredado)).toBe(heredado);
    }
  });

  it("no hay cadenas: ningún canónico es a su vez un slug viejo", () => {
    for (const [, canonical] of PAIRS) {
      expect(canonicalPortfolioSlug(canonical)).toBe(canonical);
    }
  });
});

describe("next.config genera un redirect permanente por par", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("cada slug viejo redirige a su canónico con permanent: true", async () => {
    vi.stubEnv("LEGACY_HOSTS", "");
    const { default: nextConfig } = await import("../next.config");
    const redirects = await (nextConfig.redirects?.() ?? []);

    for (const [legacy, canonical] of PAIRS) {
      expect(redirects).toContainEqual({
        source: `/portfolio/${legacy}`,
        destination: `/portfolio/${canonical}`,
        permanent: true,
      });
    }
  });

  it("conserva los 4 redirects que ya existían", async () => {
    vi.stubEnv("LEGACY_HOSTS", "");
    const { default: nextConfig } = await import("../next.config");
    const redirects = await (nextConfig.redirects?.() ?? []);

    for (const rule of [
      { source: "/portfolio/inverse-cramer", destination: "/portfolio/inverse-cramer-real", permanent: true },
      { source: "/pricing", destination: "/planes", permanent: true },
      { source: "/precios", destination: "/planes", permanent: true },
      { source: "/portfolio/afp-multifondos", destination: "/portfolio/afp-consenso-chile", permanent: true },
    ]) {
      expect(redirects).toContainEqual(rule);
    }
  });

  it("sin LEGACY_HOSTS no agrega reglas de host (staging y previews intactos)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://fraccion.si");
    vi.stubEnv("LEGACY_HOSTS", "");
    const { default: nextConfig } = await import("../next.config");
    const redirects = await (nextConfig.redirects?.() ?? []);

    expect(redirects.filter((rule) => rule.source === "/:path*")).toHaveLength(0);
  });
});
