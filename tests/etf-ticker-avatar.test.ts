import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EtfTickerAvatar } from "@/components/etf-ticker-avatar";
import { etfTickerForSlug } from "@/lib/portfolio-avatar";

/**
 * D11 — avatar tipográfico de ETF.
 *
 *  - `etfTickerForSlug`: ticker del catálogo real (ARK, Global X, iShares,
 *    VanEck, NANC/GOP), tolerante a mayúsculas/espacios; `null` para
 *    portafolios que no son ETF (personas, corredoras, AFP).
 *  - `EtfTickerAvatar`: `role="img"` + `aria-label` con el ticker, fondo
 *    blanco fijo (#ffffff / bg-white) en cualquier tamaño, cero azul.
 *
 * Render con `renderToStaticMarkup`: sin JSDOM, sin red, en milisegundos.
 */

const SLUGS: Record<string, string> = {
  arkk: "ARKK",
  arkw: "ARKW",
  arkg: "ARKG",
  arkq: "ARKQ",
  arkf: "ARKF",
  arkx: "ARKX",
  ibit: "IBIT",
  ech: "ECH",
  smh: "SMH",
  "nanc-etf": "NANC",
  "gop-etf": "GOP",
};

const NO_ETF = ["berkshire-hathaway", "trump-dice", "nancy-pelosi", "renta-4"];

function render(ticker: string, size?: number): string {
  return renderToStaticMarkup(createElement(EtfTickerAvatar, { ticker, size }));
}

describe("etfTickerForSlug", () => {
  it("mapea el catálogo real de ETFs a su ticker", () => {
    for (const [slug, ticker] of Object.entries(SLUGS)) {
      expect(etfTickerForSlug(slug)).toBe(ticker);
    }
  });

  it("normaliza mayúsculas y espacios", () => {
    expect(etfTickerForSlug(" ARKK ")).toBe("ARKK");
    expect(etfTickerForSlug("Arkk")).toBe("ARKK");
    expect(etfTickerForSlug("\tibit\n")).toBe("IBIT");
  });

  it("no inventa ticker para portafolios que no son ETF", () => {
    for (const slug of NO_ETF) {
      expect(etfTickerForSlug(slug)).toBeNull();
    }
    expect(etfTickerForSlug("")).toBeNull();
  });
});

describe("EtfTickerAvatar", () => {
  it("es una imagen accesible con el ticker como nombre", () => {
    const html = render("ARKK");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="ARKK"');
  });

  it("pinta el ticker en mayúsculas y no depende del tamaño", () => {
    for (const size of [40, 320]) {
      const html = render("arkk", size);
      expect(html).toContain(">ARKK</text>");
      expect(html).toContain(`role="img"`);
      expect(html).toMatch(new RegExp(`width:\\s*${size}px`));
      expect(html).toMatch(new RegExp(`height:\\s*${size}px`));
    }
  });

  it("fondo blanco fijo y cero azul", () => {
    for (const size of [40, 320]) {
      const html = render("ARKK", size);
      expect(html).toContain("#ffffff");
      expect(html).toContain("bg-white");
      expect(html).not.toContain("#1d4ed8");
      expect(html).not.toContain("dark:bg");
    }
  });
});
