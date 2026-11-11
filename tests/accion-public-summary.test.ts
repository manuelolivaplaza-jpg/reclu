import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccionPublicSummary } from "@/components/accion-public-summary";

/**
 * B1/T3 — resumen público de /accion (regla 1b de Manu).
 *
 * El HTML del resumen no puede contener posiciones de pago: ni porcentajes,
 * ni montos, ni fechas, ni nombres/slugs de carteras. Sí debe traer el
 * símbolo, el nombre del activo, el número agregado de portafolios y el CTA a
 * /planes.
 */

/** Carteras premium del fixture: ninguna puede aparecer en el resumen. */
const PREMIUM_PORTFOLIOS = [
  { slug: "pelosi-tracker", name: "Pelosi Tracker" },
  { slug: "scion-13f", name: "Scion Asset Management" },
  { slug: "berkshire-hathaway-13f", name: "Berkshire Hathaway" },
  { slug: "duquesne-13f", name: "Duquesne Family Office" },
  { slug: "trump-compra", name: "Trump compra (OGE)" },
];

function render(
  props: Parameters<typeof AccionPublicSummary>[0],
): string {
  return renderToStaticMarkup(createElement(AccionPublicSummary, props));
}

describe("AccionPublicSummary", () => {
  it("muestra símbolo, nombre, sector, número de portafolios y CTA", () => {
    const html = render({
      symbol: "NVDA",
      name: "NVIDIA Corporation",
      sector: "Semiconductores",
      portfolioCount: 14,
    });

    expect(html).toContain("NVDA");
    expect(html).toContain("NVIDIA Corporation");
    expect(html).toContain("Semiconductores");
    expect(html).toContain("14");
    expect(html).toContain("portafolios");
    expect(html).toContain("Está en");
    expect(html).toContain("/planes");
    expect(html).toContain("Suscríbete para ver quién la tiene");
    expect(html).toContain("<h1");
  });

  it("no filtra posiciones de pago ni carteras premium", () => {
    const html = render({
      symbol: "NVDA",
      name: "NVIDIA Corporation",
      sector: "Semiconductores",
      portfolioCount: 14,
    });
    const lower = html.toLowerCase();

    // Sin porcentajes, montos, fechas ni variaciones.
    expect(html).not.toContain("%");
    expect(html).not.toContain("$");
    expect(html).not.toMatch(/\b(19|20)\d{2}\b/);
    expect(html).not.toContain(" pp");

    for (const portfolio of PREMIUM_PORTFOLIOS) {
      expect(lower).not.toContain(portfolio.slug.toLowerCase());
      expect(lower).not.toContain(portfolio.name.toLowerCase());
    }
    expect(lower).not.toContain("/portfolio/");
  });

  it("sin sector no hay fila de sector y con 0 portafolios no hay frase ni CTA", () => {
    const html = render({
      symbol: "KO",
      name: "The Coca-Cola Company",
      sector: null,
      portfolioCount: 0,
    });

    expect(html).toContain("KO");
    expect(html).toContain("The Coca-Cola Company");
    expect(html).not.toContain("Sector");
    expect(html).not.toContain("Está en");
    expect(html).not.toContain("/planes");
  });

  it("usa singular con un solo portafolio", () => {
    const html = render({
      symbol: "KO",
      name: null,
      sector: null,
      portfolioCount: 1,
    });
    expect(html).toContain("1");
    expect(html).toContain("portafolio");
    expect(html).not.toContain("portafolios");
  });

  it("no repite el símbolo cuando el nombre viene igual al ticker", () => {
    const html = render({
      symbol: "SQM-B",
      name: "sqm-b",
      sector: null,
      portfolioCount: 2,
    });
    expect(html.match(/SQM-B/g) ?? []).toHaveLength(1);
  });

  it("ignora un número de portafolios inválido sin romper la frase", () => {
    const html = render({
      symbol: "NVDA",
      name: "NVIDIA Corporation",
      sector: "Semiconductores",
      portfolioCount: Number.NaN,
    });
    expect(html).toContain("NVDA");
    expect(html).not.toContain("Está en");
    expect(html).not.toContain("/planes");
  });
});
