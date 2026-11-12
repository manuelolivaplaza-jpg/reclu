import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PERIOD_DAYS,
  availablePeriods,
  defaultPeriod,
} from "@/components/portfolio-period-selector";
import { PortfolioCardChart } from "@/components/portfolio-card-chart";

/**
 * D8 — períodos del gráfico de una tarjeta de portafolio.
 *
 *  - `PERIOD_DAYS`: días calendario de cada ventana (MAX = serie completa).
 *  - `availablePeriods`: solo los períodos que la serie cubre de verdad; con
 *    menos de 2 puntos válidos no hay ninguno (nunca una ventana inventada).
 *  - `defaultPeriod`: 1A si existe; si no, el más largo cubierto.
 *  - `PortfolioCardChart`: sin serie suficiente no renderiza nada; con serie
 *    real pinta cifra (coma es-CL, sin NaN) y los 5 botones.
 *
 * Todo es puro + `renderToStaticMarkup`: sin red, sin JSDOM, sin Supabase.
 */

const DIA = 86_400_000;

/** `YYYY-MM-DD` a `dias` de `isoBase` (UTC, determinista). */
function fechaDesde(isoBase: string, dias: number): string {
  return new Date(Date.parse(`${isoBase}T00:00:00Z`) + dias * DIA)
    .toISOString()
    .slice(0, 10);
}

/** Serie de 3 puntos que abarca exactamente `dias` días. */
function serieDeDias(dias: number, isoBase = "2024-01-01") {
  const medio = Math.floor(dias / 2);
  return [
    { date: fechaDesde(isoBase, 0), value_pct: 0 },
    { date: fechaDesde(isoBase, medio), value_pct: 4 },
    { date: fechaDesde(isoBase, dias), value_pct: 10 },
  ];
}

function renderChart(series: { date: string; value_pct: number }[]): string {
  return renderToStaticMarkup(createElement(PortfolioCardChart, { series }));
}

/** Bloque `<button …>etiqueta</button>` de un período, o "" si no está. */
function boton(html: string, etiqueta: string): string {
  for (const trozo of html.split("<button").slice(1)) {
    const abre = trozo.indexOf(">");
    const cierra = trozo.indexOf("</button>", abre);
    if (abre === -1 || cierra === -1) continue;
    if (trozo.slice(abre + 1, cierra) === etiqueta) {
      return `<button${trozo.slice(0, cierra + "</button>".length)}`;
    }
  }
  return "";
}

describe("PERIOD_DAYS", () => {
  it("fija los días calendario de cada ventana", () => {
    expect(PERIOD_DAYS).toEqual({ "1M": 30, "3M": 91, "6M": 182, "1A": 365 });
  });
});

describe("availablePeriods", () => {
  it("sin puntos válidos no hay períodos", () => {
    expect(availablePeriods([])).toEqual([]);
    expect(availablePeriods([{ date: "2024-01-01", value_pct: 0 }])).toEqual([]);
    expect(
      availablePeriods([
        { date: "2024-01-01", value_pct: Number.NaN },
        { date: "2024-02-01", value_pct: 5 },
      ]),
    ).toEqual([]);
    expect(
      availablePeriods([
        { date: "no-es-fecha", value_pct: 0 },
        { date: "2024-06-01", value_pct: 5 },
      ]),
    ).toEqual([]);
  });

  it("con 10 días solo alcanza MAX", () => {
    expect(availablePeriods(serieDeDias(10))).toEqual(["MAX"]);
  });

  it("con ~45 días habilita 1M y MAX", () => {
    expect(availablePeriods(serieDeDias(45))).toEqual(["1M", "MAX"]);
  });

  it("con ~200 días habilita 1M, 3M, 6M y MAX", () => {
    expect(availablePeriods(serieDeDias(200))).toEqual(["1M", "3M", "6M", "MAX"]);
  });

  it("con un año o más habilita los cinco períodos", () => {
    expect(availablePeriods(serieDeDias(365))).toEqual(["1M", "3M", "6M", "1A", "MAX"]);
    expect(availablePeriods(serieDeDias(400))).toEqual(["1M", "3M", "6M", "1A", "MAX"]);
  });

  it("el borde de tolerancia también cuenta como año cubierto", () => {
    // 361 días contra un umbral de 365 − 5 = 360.
    expect(availablePeriods(serieDeDias(361), 5)).toEqual(["1M", "3M", "6M", "1A", "MAX"]);
    // 359 días queda fuera por 1 día.
    expect(availablePeriods(serieDeDias(359), 5)).toEqual(["1M", "3M", "6M", "MAX"]);
  });

  it("no depende del orden de entrada", () => {
    const ordenada = serieDeDias(200);
    const desordenada = [ordenada[2], ordenada[0], ordenada[1]];
    expect(availablePeriods(desordenada)).toEqual(availablePeriods(ordenada));
    expect(availablePeriods(desordenada)).toEqual(["1M", "3M", "6M", "MAX"]);
  });
});

describe("defaultPeriod", () => {
  it("prefiere 1A cuando está disponible", () => {
    expect(defaultPeriod(["1M", "3M", "6M", "1A", "MAX"])).toBe("1A");
    expect(defaultPeriod(["1A"])).toBe("1A");
  });

  it("sin año cae al más largo cubierto (MAX antes que 6M/3M/1M)", () => {
    expect(defaultPeriod(["1M", "3M", "6M", "MAX"])).toBe("MAX");
    expect(defaultPeriod(["1M", "3M"])).toBe("3M");
    expect(defaultPeriod(["1M"])).toBe("1M");
  });

  it("sin períodos devuelve null", () => {
    expect(defaultPeriod([])).toBeNull();
  });
});

describe("PortfolioCardChart", () => {
  it("sin 2 puntos válidos no renderiza nada", () => {
    expect(renderChart([])).toBe("");
    expect(renderChart([{ date: "2025-01-01", value_pct: 5 }])).toBe("");
    expect(
      renderChart([
        { date: "2025-01-01", value_pct: Number.NaN },
        { date: "2025-02-01", value_pct: Number.POSITIVE_INFINITY },
      ]),
    ).toBe("");
  });

  it("con más de un año pinta cifra con coma, svg y los 5 botones", () => {
    const html = renderChart([
      { date: fechaDesde("2024-01-15", 0), value_pct: 0 },
      { date: fechaDesde("2024-01-15", 402), value_pct: 25 },
    ]);

    expect(html).toContain("<svg");
    expect(html).toMatch(/\+25,0%/);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain("1 año");

    for (const etiqueta of ["1M", "3M", "6M", "1A", "Máx"]) {
      const b = boton(html, etiqueta);
      expect(b).not.toBe("");
      expect(b).toContain('aria-disabled="false"');
    }

    const unoA = boton(html, "1A");
    expect(unoA).toContain('aria-pressed="true"');
    expect(unoA).not.toMatch(/ disabled(?=[\s>=]|$)/);
  });

  it("con ~7 meses cae a 'Desde inicio' y deshabilita 1A", () => {
    const html = renderChart([
      { date: fechaDesde("2025-01-10", 0), value_pct: 0 },
      { date: fechaDesde("2025-01-10", 100), value_pct: 6 },
      { date: fechaDesde("2025-01-10", 207), value_pct: 12 },
    ]);

    expect(html).toContain("<svg");
    expect(html).toContain("Desde inicio");
    expect(html).toContain("ene 2025");
    expect(html).toMatch(/\+12,0%/);
    expect(html).not.toMatch(/NaN|Infinity/);

    const unoA = boton(html, "1A");
    expect(unoA).toContain('aria-disabled="true"');
    expect(unoA).toMatch(/ disabled(?=[\s>=]|$)/);

    const max = boton(html, "Máx");
    expect(max).toContain('aria-pressed="true"');
    expect(max).not.toMatch(/ disabled(?=[\s>=]|$)/);
  });
});
