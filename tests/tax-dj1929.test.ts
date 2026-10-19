import { describe, expect, it } from "vitest";
import {
  DJ1929_NO_CALCULA_IMPUESTO,
  PARTICIPACION_POR_DEFECTO,
  RELACION_SIN_RELACION,
  normalizarPais,
  resumirInstrumentos,
  type Operacion,
} from "@/lib/tax/dj1929";
import * as fx from "@/lib/tax/fx";
import { FORMATO_CSV_GENERICO, interpretarMonto, parseGenericCsv } from "@/lib/tax/import";

const TIPO = 900;

function fila(codigo: number, nombre = "Apple") {
  return resumirInstrumentos(opsDeEjemplo(), TIPO).filas.find(
    (item) => item.codigo === codigo && item.nombre === nombre,
  );
}

function opsDeEjemplo(): Operacion[] {
  return [
    {
      nombre: "Apple",
      pais: "US",
      fecha: "2025-06-01",
      tipo: "dividendo",
      montoUsd: 12.5,
      impuestoRetenidoUsd: 1.88,
      domicilio: "One Apple Park Way",
      ciudad: "Cupertino",
    },
    {
      nombre: "Apple",
      pais: "US",
      fecha: "2025-08-01",
      tipo: "venta",
      montoUsd: 150,
      costoUsd: 100,
    },
    {
      nombre: "Apple",
      pais: "US",
      fecha: "2025-09-01",
      tipo: "venta",
      montoUsd: 80,
      costoUsd: 100,
    },
    {
      nombre: "Apple",
      pais: "US",
      fecha: "2025-12-31",
      tipo: "posicion",
      montoUsd: 1000,
    },
  ];
}

describe("tipo de cambio", () => {
  it("no trae un dólar observado", () => {
    expect(Object.keys(fx).some((key) => /dolar|observado|default/i.test(key))).toBe(false);
  });

  it("rechaza cero, negativos y valores que no son números", () => {
    expect(() => fx.assertTipoCambio(0)).toThrow(/tipo de cambio/i);
    expect(() => fx.usdAClp(10, -1)).toThrow(/tipo de cambio/i);
    expect(() => fx.usdAClp(10, Number.NaN)).toThrow(/tipo de cambio/i);
    expect(() => resumirInstrumentos([], Number.POSITIVE_INFINITY)).toThrow(/tipo de cambio/i);
  });

  it("redondea a pesos y corrige el centavo binario", () => {
    expect(fx.centavosUsd(1.015)).toBe(102);
    expect(fx.centavosUsd(0.1 + 0.2)).toBe(30);
    expect(fx.usdAClp(2.5, 1)).toBe(3);
    expect(fx.usdAClp(1, 900.5)).toBe(901);
    expect(fx.centavosAClp(1, 50)).toBe(1);
  });
});

describe("resumen DJ 1929", () => {
  it("separa dividendos, ganancias, pérdidas y el valor al 31.12", () => {
    const resumen = resumirInstrumentos(opsDeEjemplo(), TIPO);
    const dividendos = fila(10);
    const capital = fila(13);

    expect(dividendos).toMatchObject({
      nombre: "Apple",
      pais: "US",
      codigo: 10,
      monto31DicUsd: 0,
      monto31DicClp: 0,
      rentasUsd: 12.5,
      rentasClp: 11_250,
      perdidasUsd: 0,
      impuestoRetenidoUsd: 1.88,
      impuestoRetenidoClp: 1_692,
      domicilio: "One Apple Park Way",
      ciudad: "Cupertino",
    });
    expect(capital).toMatchObject({
      codigo: 13,
      monto31DicUsd: 1000,
      monto31DicClp: 900_000,
      rentasUsd: 50,
      rentasClp: 45_000,
      perdidasUsd: 20,
      perdidasClp: 18_000,
      impuestoRetenidoUsd: 0,
      domicilio: undefined,
      ciudad: undefined,
    });
    expect(resumen.avisos.some((aviso) => aviso.includes("No se netean"))).toBe(true);
    expect(JSON.stringify(resumen)).not.toMatch(/impuestoAPagar|impuesto_a_pagar/i);
  });

  it("no resta la retención de la renta", () => {
    const resumen = resumirInstrumentos(
      [
        {
          nombre: "Microsoft",
          pais: "us",
          tipo: "dividendo",
          montoUsd: 10,
          impuestoRetenidoUsd: 3,
          domicilio: "One Microsoft Way",
          ciudad: "Redmond",
        },
      ],
      1000,
    );
    expect(resumen.filas[0]).toMatchObject({
      pais: "US",
      rentasUsd: 10,
      rentasClp: 10_000,
      impuestoRetenidoUsd: 3,
      impuestoRetenidoClp: 3_000,
    });
  });

  it("no usa el costo de compra como valor al 31.12 ni inventa la renta de una venta", () => {
    const resumen = resumirInstrumentos(
      [
        { nombre: "Tesla", pais: "US", tipo: "compra", montoUsd: 5000, cantidad: 10 },
        { nombre: "Tesla", pais: "US", tipo: "venta", montoUsd: 800, cantidad: 2 },
      ],
      TIPO,
    );
    expect(resumen.filas).toEqual([]);
    expect(resumen.totales.rentasClp).toBe(0);
    expect(resumen.totales.monto31DicClp).toBe(0);
    expect(resumen.avisos.some((aviso) => aviso.includes("sin costo"))).toBe(true);
    expect(resumen.avisos.some((aviso) => aviso.includes("no hay valor al 31.12"))).toBe(true);
  });

  it("toma el costo cero como dato explícito", () => {
    const resumen = resumirInstrumentos(
      [{ nombre: "Tesla", pais: "US", tipo: "venta", montoUsd: 40, costoUsd: 0 }],
      10,
    );
    expect(resumen.filas[0]).toMatchObject({ codigo: 13, rentasUsd: 40, perdidasUsd: 0 });
  });

  it("suma varias posiciones y no netea instrumentos distintos", () => {
    const resumen = resumirInstrumentos(
      [
        { nombre: "A", pais: "US", tipo: "posicion", montoUsd: 1.4 },
        { nombre: "A", pais: "US", tipo: "posicion", montoUsd: 0.6 },
        { nombre: "B", pais: "US", tipo: "posicion", montoUsd: 1.4 },
      ],
      1,
    );
    const a = resumen.filas.find((item) => item.nombre === "A");
    const b = resumen.filas.find((item) => item.nombre === "B");
    expect(a).toMatchObject({ monto31DicUsd: 2, monto31DicClp: 2 });
    expect(b).toMatchObject({ monto31DicClp: 1 });
    expect(resumen.totales.monto31DicClp).toBe(3);
    expect(resumen.avisos.some((aviso) => aviso.includes("se sumaron 2"))).toBe(true);
  });

  it("separa el mismo nombre en dos países y clasifica interés y otras rentas", () => {
    const resumen = resumirInstrumentos(
      [
        { nombre: "Fondo", pais: "US", tipo: "interes", montoUsd: 5 },
        { nombre: "Fondo", pais: "IE", tipo: "otra", montoUsd: 7, domicilio: "Dock", ciudad: "Dublin" },
        { nombre: "fondo", pais: "US", tipo: "interes", montoUsd: 1 },
      ],
      100,
    );
    expect(resumen.filas.map((item) => [item.nombre, item.pais, item.codigo, item.rentasUsd])).toEqual([
      ["Fondo", "IE", 21, 7],
      ["Fondo", "US", 11, 6],
    ]);
    expect(resumen.filas.find((item) => item.codigo === 11)?.domicilio).toBeUndefined();
    expect(resumen.filas.find((item) => item.codigo === 21)?.domicilio).toBe("Dock");
  });

  it("deja fuera otro año y avisa si falta domicilio en dividendos", () => {
    const resumen = resumirInstrumentos(
      [
        { nombre: "Apple", pais: "US", fecha: "2024-12-31", tipo: "dividendo", montoUsd: 99 },
        { nombre: "Apple", pais: "US", fecha: "2025-01-02", tipo: "dividendo", montoUsd: 4 },
        { nombre: "Nueva", pais: "US", tipo: "dividendo", montoUsd: 1 },
      ],
      1,
      { anio: 2025 },
    );
    expect(resumen.filas.find((item) => item.nombre === "Apple")?.rentasUsd).toBe(4);
    expect(resumen.avisos.some((aviso) => aviso.includes("es de 2024"))).toBe(true);
    expect(resumen.avisos.some((aviso) => aviso.includes("no tiene fecha"))).toBe(true);
    expect(resumen.avisos.some((aviso) => aviso.includes("código 10") && aviso.includes("domicilio"))).toBe(
      true,
    );
  });

  it("avisa cuando la retención supera la renta y no topa el crédito", () => {
    const resumen = resumirInstrumentos(
      [
        {
          nombre: "Apple",
          pais: "US",
          tipo: "dividendo",
          montoUsd: 10,
          impuestoRetenidoUsd: 15,
          domicilio: "Park",
          ciudad: "Cupertino",
        },
      ],
      1,
    );
    expect(resumen.filas[0]).toMatchObject({ rentasUsd: 10, impuestoRetenidoUsd: 15 });
    expect(resumen.avisos.some((aviso) => aviso.includes("No se calcula el tope"))).toBe(true);
  });

  it("ignora una compra al sumar y rechaza un año imposible", () => {
    const resumen = resumirInstrumentos(
      [
        { nombre: "Apple", pais: "Estados Unidos", tipo: "compra", montoUsd: 20, impuestoRetenidoUsd: 1 },
        { nombre: "Apple", pais: "US", tipo: "posicion", montoUsd: 25 },
      ],
      2,
    );
    expect(resumen.filas).toHaveLength(1);
    expect(resumen.filas[0]).toMatchObject({ monto31DicUsd: 25, monto31DicClp: 50, impuestoRetenidoUsd: 0 });
    expect(resumen.avisos.some((aviso) => aviso.includes("compra"))).toBe(true);
    expect(() => resumirInstrumentos([], 1, { anio: 1800 })).toThrow(/año comercial/i);
  });

  it("suma los pesos de cada fila y no vuelve a redondear el total", () => {
    const resumen = resumirInstrumentos(
      [
        { nombre: "A", pais: "US", tipo: "posicion", montoUsd: 1.4 },
        { nombre: "B", pais: "US", tipo: "posicion", montoUsd: 1.4 },
      ],
      1,
    );
    expect(resumen.totales).toMatchObject({
      monto31DicClp: 2,
      casos: 2,
      rentasClp: 0,
      perdidasClp: 0,
      impuestoRetenidoClp: 0,
    });
  });

  it("declara que no calcula el impuesto y deja la relación en el código oficial 9", () => {
    expect(DJ1929_NO_CALCULA_IMPUESTO.toLowerCase()).toContain("no calculan el impuesto");
    expect(RELACION_SIN_RELACION).toBe(9);
    expect(PARTICIPACION_POR_DEFECTO).toBe(0);
    expect(normalizarPais("U.S.")).toBe("US");
    expect(normalizarPais("Chile")).toBe("CL");
    expect(normalizarPais("Reino Unido")).toBeNull();
  });
});

describe("CSV genérico", () => {
  it("lee el ejemplo documentado y arma el resumen", () => {
    const { operaciones, errores } = parseGenericCsv(FORMATO_CSV_GENERICO);
    expect(errores).toEqual([]);
    expect(operaciones).toHaveLength(3);
    expect(operaciones[0]).toMatchObject({
      nombre: "Apple",
      pais: "US",
      tipo: "dividendo",
      montoUsd: 12.5,
      impuestoRetenidoUsd: 1.88,
      cantidad: 10,
      domicilio: "One Apple Park Way",
      ciudad: "Cupertino",
    });
    expect(operaciones[1]?.costoUsd).toBe(1000);
    expect(operaciones[2]?.costoUsd).toBeUndefined();

    const resumen = resumirInstrumentos(operaciones, 1000);
    expect(resumen.filas.map((item) => item.codigo)).toEqual([10, 13]);
    expect(resumen.filas[1]).toMatchObject({ monto31DicUsd: 1800, rentasUsd: 500, perdidasUsd: 0 });
  });

  it("acepta coma decimal, encabezados en español y punto y coma", () => {
    const csv = "Nombre;País;Tipo;Monto USD;Impuesto retenido\nNestlé;US;dividendo;12,50;1,25\n";
    const { operaciones, errores } = parseGenericCsv(csv);
    expect(errores).toEqual([]);
    expect(operaciones[0]).toMatchObject({ nombre: "Nestlé", montoUsd: 12.5, impuestoRetenidoUsd: 1.25 });
  });

  it("interpreta miles y no confunde un punto solo", () => {
    expect(interpretarMonto("1.234,56")).toBe(1234.56);
    expect(interpretarMonto("1,234.56")).toBe(1234.56);
    expect(interpretarMonto("USD 10")).toBe(10);
    expect(interpretarMonto("1.234")).toBe(1.234);
    expect(interpretarMonto("")).toBeNull();
    expect(interpretarMonto("1e3")).toBeNull();
  });

  it("informa la fila mala y sigue con las buenas", () => {
    const csv = "nombre,pais,tipo,monto_usd\nApple,US,dividendo,10\n,US,venta,-5\n";
    const { operaciones, errores } = parseGenericCsv(csv);
    expect(operaciones).toHaveLength(1);
    expect(errores[0]).toMatch(/Fila de datos 2/);
  });

  it("no adivina el CSV de Racional, que viene sin encabezados", () => {
    const racional = "13,,Apple,,US,,,,,0,1800,0,,0,,,,,,0\n";
    const { operaciones, errores } = parseGenericCsv(racional);
    expect(operaciones).toEqual([]);
    expect(errores.some((error) => error.includes("Racional"))).toBe(true);
  });

  it("rechaza vacío, columnas duplicadas y un costo que no es número", () => {
    expect(parseGenericCsv("   ").errores).toEqual(["El CSV está vacío."]);
    expect(parseGenericCsv("nombre,nombre,pais,tipo,monto_usd\nA,A,US,compra,1\n").errores[0]).toMatch(
      /duplicadas/,
    );
    const malo = parseGenericCsv("nombre,pais,tipo,monto_usd,costo_usd\nA,US,venta,10,no-es\n");
    expect(malo.operaciones).toEqual([]);
    expect(malo.errores[0]).toMatch(/costo/);
  });

  it("no trata el costo vacío como cero", () => {
    const { operaciones } = parseGenericCsv("nombre,pais,tipo,monto_usd,costo_usd\nA,US,venta,10,\n");
    expect(operaciones[0]?.costoUsd).toBeUndefined();
    const resumen = resumirInstrumentos(operaciones, 1);
    expect(resumen.filas).toEqual([]);
  });
});
