import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildHeroCards } from "@/lib/hero-portfolios";
import {
  DEFAULT_RANKINGS_PERIOD,
  pickDefaultRankingsPeriod,
  topByReturnDiverse,
  type RankingEntry,
} from "@/lib/portfolio-rankings";
import type { Portfolio } from "@/lib/types";

/**
 * D15 — guardia del diseño de la home (Tandas 1 y 2).
 *
 *  1. `globals.css`: lienzo `container-page` (1560px, 16px móvil), utilidades
 *     `container-wide` / `section-y`, variante `dark` y ausencia del halo
 *     radial verde en las superficies públicas.
 *  2. `hero-portfolios`: sin catálogo no hay tarjetas inventadas.
 *  3. `portfolio-rankings`: 1A por defecto y mezcla real de categorías.
 *  4. Lectura estática de las secciones: cero marca vieja, cero "12.990",
 *     cero "0 seguidores" y cero globo rojo en `how-it-works`.
 *
 * Solo fs + funciones puras: sin red, sin Supabase, sin JSDOM.
 */

// Raíz del repo deducida de `tests/`, no del cwd.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fuente = (rutaRelativa: string) =>
  readFileSync(path.join(RAIZ, rutaRelativa), "utf8");

/** Quita comentarios conservando los saltos de línea. */
function sinComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (comentario) => comentario.replace(/[^\n]/g, ""))
    .replace(/(^|[ \t])\/\/[^\n]*/gm, "$1");
}

/** Cuerpo de un bloque CSS (`selector { … }`), o "" si no existe. */
function bloqueCss(css: string, selector: string): string {
  const inicio = css.indexOf(`${selector} {`);
  if (inicio === -1) return "";
  const fin = css.indexOf("}", inicio);
  return fin === -1 ? "" : css.slice(inicio, fin);
}

describe("globals.css: lienzo y superficies", () => {
  const css = fuente("src/app/globals.css");

  it("container-page llega a 1560px y respeta 16px en móvil", () => {
    const bloque = bloqueCss(css, "@utility container-page");
    expect(bloque).not.toBe("");

    const maxWidth = /max-width:\s*(\d+)px/.exec(bloque);
    expect(maxWidth).not.toBeNull();
    expect(Number(maxWidth?.[1])).toBeGreaterThanOrEqual(1520);

    const padding = /padding-inline:\s*([^;]+);/.exec(bloque);
    expect(padding?.[1].trim()).toBe("1rem");
  });

  it("existen container-wide, section-y y la variante dark", () => {
    expect(css).toMatch(/@utility container-wide\s*\{/);
    expect(css).toMatch(/@utility section-y\s*\{/);
    expect(bloqueCss(css, "@utility container-wide")).toMatch(/max-width:\s*1600px/);
    expect(bloqueCss(css, "@utility section-y")).toContain("padding-block");
    expect(css).toContain("@custom-variant dark");
  });

  it("las superficies públicas ya no llevan halo radial verde", () => {
    for (const selector of [".pub-canvas", ".pub-card-dark"]) {
      const bloque = bloqueCss(css, selector);
      expect(bloque).not.toBe("");
      expect(bloque).not.toContain("rgb(15 122 50");
      expect(bloque).not.toContain("radial-gradient");
    }
  });

  it("la home usa el lienzo container-page", () => {
    expect(fuente("src/components/sections/hero.tsx")).toContain("container-page");
    expect(fuente("src/components/site-header.tsx")).toContain("container-page");
  });
});

/** Portafolio completo para las pruebas de la home. */
function portfolio(
  slug: string,
  name: string,
  overrides: Partial<Omit<Portfolio, "slug" | "name">> = {},
): Portfolio {
  const base: Portfolio = {
    id: `id-${slug}`,
    slug,
    name,
    description: "",
    category: "hedge_fund",
    source: "test",
    manager: null,
    country: "US",
    followers: 0,
    return_ytd: 0,
    premium: false,
    tags: [],
    cover_image: null,
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
  };
  // Object.assign (no spread): conserva null explícitos como return_ytd.
  return Object.assign(base, overrides);
}

describe("hero-portfolios: solo datos reales", () => {
  it("catálogo vacío devuelve cero tarjetas (nada de 'Ejemplo')", () => {
    expect(buildHeroCards([])).toEqual([]);
  });

  it("usa el catálogo real, sin premium, sin retorno nulo y sin isExample", () => {
    const catalogo = [
      portfolio("premium-caro", "Premium caro", { premium: true, return_ytd: 99, followers: 900 }),
      portfolio("sin-retorno", "Sin retorno", { return_ytd: null, followers: 800 }),
      portfolio("tres", "Tercero", { return_ytd: 12.5, followers: 30, manager: "Gestora Tres" }),
      portfolio("uno", "Primero", { return_ytd: 7.1, followers: 50 }),
      portfolio("dos", "Segundo", { return_ytd: -3.2, followers: 40 }),
    ];

    const tarjetas = buildHeroCards(catalogo, 3);

    expect(tarjetas.map((tarjeta) => tarjeta.slug)).toEqual(["uno", "dos", "tres"]);
    expect(tarjetas.every((tarjeta) => tarjeta.isExample === false)).toBe(true);
    expect(tarjetas.some((tarjeta) => /ejemplo/i.test(tarjeta.name))).toBe(false);
    expect(tarjetas[0]).toMatchObject({
      slug: "uno",
      name: "Primero",
      returnPct: 7.1,
      followers: 50,
      manager: null,
    });
    expect(buildHeroCards(catalogo, 2)).toHaveLength(2);
  });
});

/** Candidato al ranking con categoría y familia (manager) distintas. */
function entry(
  slug: string,
  category: RankingEntry["category"],
  returnPct: number,
  manager: string,
): RankingEntry {
  return {
    slug,
    name: `Fondo ${slug.toUpperCase()}`,
    manager,
    coverImage: null,
    category,
    followers: 10,
    returnPct,
  };
}

describe("portfolio-rankings: período y diversidad", () => {
  it("abre en 1A cuando el ranking lo cubre", () => {
    expect(DEFAULT_RANKINGS_PERIOD).toBe("1A");
    expect(pickDefaultRankingsPeriod(["3M", "6M", "1A", "2A"])).toBe("1A");
    expect(pickDefaultRankingsPeriod(["3M", "6M"])).toBe("6M");
    expect(pickDefaultRankingsPeriod([])).toBeNull();
  });

  it("el primer pase mezcla categorías y deja al #1 absoluto en índice 0", () => {
    const filas = topByReturnDiverse(
      [
        entry("a", "political_us", 100, "Gestora A"),
        entry("b", "political_us", 95, "Gestora B"),
        entry("c", "hedge_fund", 90, "Gestora C"),
        entry("d", "broker_cl", 85, "Gestora D"),
        entry("e", "thematic", 80, "Gestora E"),
        entry("f", "model", 75, "Gestora F"),
      ],
      5,
    );

    expect(filas).toHaveLength(5);
    expect(filas[0].slug).toBe("a");
    // 1 por categoría en el primer pase: b (segundo political_us) queda fuera.
    expect(filas.map((fila) => fila.slug)).toEqual(["a", "c", "d", "e", "f"]);
    expect(new Set(filas.map((fila) => fila.category)).size).toBe(5);
  });
});

describe("home: copy y marca vigentes", () => {
  const ARCHIVOS = [
    "src/components/sections/hero.tsx",
    "src/components/sections/statement.tsx",
    "src/components/sections/how-it-works.tsx",
    "src/components/sections/pricing.tsx",
    "src/components/sections/faq.tsx",
    "src/components/sections/close.tsx",
    "src/components/site-header.tsx",
    "src/components/site-footer.tsx",
    "src/app/page.tsx",
    "src/app/planes/page.tsx",
  ];

  for (const archivo of ARCHIVOS) {
    it(`${archivo} no muestra marca vieja ni precios o seguidores inventados`, () => {
      const limpio = sinComentarios(fuente(archivo));
      expect(limpio).not.toMatch(/\breclu\b/i);
      expect(limpio).not.toContain("12.990");
      expect(limpio).not.toContain("0 seguidores");
    });
  }

  it("how-it-works no usa el globo rojo", () => {
    const limpio = sinComentarios(fuente("src/components/sections/how-it-works.tsx"));
    expect(limpio).not.toContain("#c81e1e");
    expect(limpio).not.toContain("rgb(200 30 30");
  });

  it("pricing expone mensual y anual desde PLANS sin Sparkles ni verde decorativo", () => {
    const limpio = sinComentarios(fuente("src/components/sections/pricing.tsx"));
    expect(limpio).not.toContain("Sparkles");
    expect(limpio).not.toContain("bg-positive");
    expect(limpio).not.toContain("text-positive");
    expect(limpio).toContain("PLANS.pro.monthlyPrice");
    expect(limpio).toContain("PLANS.pro.annualTotalPrice");
  });
});
