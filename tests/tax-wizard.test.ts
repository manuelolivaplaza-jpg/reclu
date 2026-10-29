import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ANIO_DEFECTO,
  CSV_RESUMEN_ENCABEZADO,
  GUIAS_OFICIALES,
  PASOS,
  PLAZOS,
  armarCsvResumen,
  estadoInicial,
  formatoClp,
  formatoUsd,
  indicePaso,
  motivoBloqueo,
  nombreArchivoCsv,
  parsearTipoCambio,
  pasoAnterior,
  pasoSiguiente,
  puedeAvanzar,
  resumir,
  type EstadoWizard,
} from "@/components/tax/tax-wizard";
import { FORMATO_CSV_GENERICO, parseGenericCsv } from "@/lib/tax/import";

function estadoConEjemplo(parcial: Partial<EstadoWizard> = {}): EstadoWizard {
  const { operaciones } = parseGenericCsv(FORMATO_CSV_GENERICO);
  return { ...estadoInicial(), operaciones, ...parcial };
}

describe("orden de los pasos", () => {
  it("son subir, revisar y resumen", () => {
    expect(PASOS).toEqual(["subir", "revisar", "resumen"]);
  });

  it("numera cada paso desde cero", () => {
    expect(indicePaso("subir")).toBe(0);
    expect(indicePaso("revisar")).toBe(1);
    expect(indicePaso("resumen")).toBe(2);
  });

  it("avanza y retrocede en los bordes", () => {
    expect(pasoSiguiente("subir")).toBe("revisar");
    expect(pasoSiguiente("revisar")).toBe("resumen");
    expect(pasoSiguiente("resumen")).toBeNull();
    expect(pasoAnterior("subir")).toBeNull();
    expect(pasoAnterior("revisar")).toBe("subir");
    expect(pasoAnterior("resumen")).toBe("revisar");
  });

  it("parte en subir y sin operaciones", () => {
    const inicial = estadoInicial();
    expect(inicial.paso).toBe("subir");
    expect(inicial.operaciones).toEqual([]);
    expect(inicial.erroresCsv).toEqual([]);
    expect(inicial.anio).toBe(ANIO_DEFECTO);
  });
});

describe("motivoBloqueo y puedeAvanzar", () => {
  it("no deja avanzar sin operaciones", () => {
    expect(puedeAvanzar(estadoInicial())).toBe(false);
    expect(motivoBloqueo(estadoInicial())).toMatch(/CSV/);
  });

  it("deja avanzar desde subir cuando hay operaciones", () => {
    expect(puedeAvanzar(estadoConEjemplo())).toBe(true);
    expect(motivoBloqueo(estadoConEjemplo())).toBeNull();
  });

  it("en revisar exige un tipo de cambio válido", () => {
    const sinTc = estadoConEjemplo({ paso: "revisar" });
    expect(puedeAvanzar(sinTc)).toBe(false);
    expect(motivoBloqueo(sinTc)).toMatch(/tipo de cambio/i);

    const conTc = estadoConEjemplo({ paso: "revisar", tipoCambio: "900" });
    expect(puedeAvanzar(conTc)).toBe(true);
  });

  it("en el resumen no hay nada más que bloquear", () => {
    const enResumen = estadoConEjemplo({ paso: "resumen", tipoCambio: "900" });
    expect(puedeAvanzar(enResumen)).toBe(true);
    expect(motivoBloqueo(enResumen)).toBeNull();
  });
});

describe("parsearTipoCambio", () => {
  it("acepta punto y coma decimal", () => {
    expect(parsearTipoCambio("900")).toBe(900);
    expect(parsearTipoCambio("900,5")).toBe(900.5);
    expect(parsearTipoCambio("1.234,56")).toBe(1234.56);
    expect(parsearTipoCambio(" 950 ")).toBe(950);
  });

  it("rechaza vacío, cero, negativos y texto", () => {
    expect(parsearTipoCambio("")).toBeNull();
    expect(parsearTipoCambio("0")).toBeNull();
    expect(parsearTipoCambio("-10")).toBeNull();
    expect(parsearTipoCambio("abc")).toBeNull();
  });
});

describe("resumir", () => {
  it("no arma nada sin tipo de cambio", () => {
    expect(resumir(estadoConEjemplo({ paso: "revisar" }))).toBeNull();
  });

  it("convierte los montos a pesos con el tipo de cambio ingresado", () => {
    const resumen = resumir(estadoConEjemplo({ paso: "revisar", tipoCambio: "900" }));
    expect(resumen).not.toBeNull();

    const ventas = resumen?.filas.find((fila) => fila.codigo === 13);
    expect(ventas?.rentasUsd).toBe(500);
    expect(ventas?.rentasClp).toBe(450_000);
    expect(resumen?.totales.monto31DicClp).toBe(1_620_000);

    const dividendos = resumen?.filas.find((fila) => fila.codigo === 10);
    expect(dividendos?.rentasClp).toBe(11_250);
    expect(dividendos?.impuestoRetenidoClp).toBe(1692);
  });
});

describe("CSV de salida", () => {
  it("lleva encabezado y una línea por fila", () => {
    const resumen = resumir(estadoConEjemplo({ paso: "resumen", tipoCambio: "900" }));
    const csv = armarCsvResumen(resumen?.filas ?? []);
    const lineas = csv.trimEnd().split("\n");
    expect(lineas[0]).toBe(CSV_RESUMEN_ENCABEZADO);
    expect(lineas).toHaveLength((resumen?.filas.length ?? 0) + 1);
    expect(csv).toContain("Apple");
  });

  it("nombra el archivo con el año", () => {
    expect(nombreArchivoCsv(2025)).toBe("resumen-dj1929-fraccion-2025.csv");
  });
});

describe("formato de cifras", () => {
  it("usa punto de miles y coma decimal", () => {
    expect(formatoClp(1_620_000)).toBe("1.620.000");
    expect(formatoClp(0)).toBe("0");
    expect(formatoUsd(12.5)).toBe("12,50");
    expect(formatoUsd(1500)).toBe("1.500,00");
  });
});

describe("datos de referencia", () => {
  it("recuerda los dos plazos", () => {
    expect(PLAZOS).toHaveLength(2);
    const texto = PLAZOS.map((plazo) => `${plazo.etiqueta} ${plazo.plazo} ${plazo.detalle}`).join(" ");
    expect(texto).toContain("30 de junio");
    expect(texto).toMatch(/abril/);
    expect(texto).toContain("1104");
  });

  it("enlaza guías oficiales por https", () => {
    expect(GUIAS_OFICIALES.length).toBeGreaterThanOrEqual(3);
    for (const guia of GUIAS_OFICIALES) {
      expect(guia.url.startsWith("https://")).toBe(true);
      expect(guia.titulo.length).toBeGreaterThan(0);
    }
    expect(GUIAS_OFICIALES.some((guia) => guia.url.includes("sii.cl"))).toBe(true);
  });
});

describe("sin envío de datos al servidor", () => {
  const raiz = process.cwd();
  const fuenteWizard = readFileSync(
    path.join(raiz, "src/components/tax/tax-wizard.tsx"),
    "utf8",
  );
  const fuentePagina = readFileSync(
    path.join(raiz, "src/app/herramientas/impuestos/page.tsx"),
    "utf8",
  );

  it("el asistente no llama a fetch ni a otros envíos", () => {
    expect(fuenteWizard).not.toMatch(/\bfetch\s*\(/);
    expect(fuenteWizard).not.toContain("XMLHttpRequest");
    expect(fuenteWizard).not.toContain("sendBeacon");
    expect(fuenteWizard).not.toMatch(/<form[^>]*action=/);
  });

  it("la página muestra el aviso legal de impuestos", () => {
    expect(fuentePagina).toContain('LegalNotice kind="tax"');
  });
});
