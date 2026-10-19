import { describe, it, expect } from "vitest";
import {
  formatFechaDeclaracion,
  formatValorClp,
  toEmpresaPublica,
} from "@/lib/infoprobidad";

describe("InfoProbidad agregado", () => {
  it("formatea pesos chilenos y deja vacío el valor desconocido", () => {
    expect(formatValorClp(null)).toBe("—");
    expect(formatValorClp(0)).toBe("—");
    expect(formatValorClp(1250000)).toBe("$1.250.000");
  });

  it("formatea la fecha de declaración", () => {
    expect(formatFechaDeclaracion(null)).toBe("—");
    expect(formatFechaDeclaracion("2026-10-08")).toBe("8 oct 2026");
    expect(formatFechaDeclaracion("2026-10-08T00:00:00")).toBe("8 oct 2026");
  });

  it("descarta rut 0 y no copia columnas personales", () => {
    expect(toEmpresaPublica({ rut: "0", nombre: "SIN RUT", autoridades: 9 })).toBeNull();
    const row = toEmpresaPublica({
      rut: "89.862.200",
      nombre: "LATAM",
      symbol: "LTM",
      autoridades: "106",
      valor_declarado_clp: "1000",
      ultima_declaracion: "2026-10-07",
      direccion: "no debe pasar",
    });
    expect(row).toEqual({
      rut: "89862200",
      nombre: "LATAM",
      symbol: "LTM",
      autoridades: 106,
      valorDeclaradoClp: 1000,
      ultimaDeclaracion: "2026-10-07",
    });
    expect(row && "direccion" in row).toBe(false);
    const conDv = toEmpresaPublica({
      rut: "89.862.200-2",
      nombre: "LATAM",
      autoridades: 1,
    });
    expect(conDv?.rut).toBe("89862200");
  });
});
