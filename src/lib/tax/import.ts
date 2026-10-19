/**
 * CSV genérico de operaciones del año para la DJ 1929.
 *
 * Columnas (la primera fila es el encabezado; el orden da igual):
 *
 * | columna                  | obliga | qué es                                                         |
 * | ------------------------ | ------ | -------------------------------------------------------------- |
 * | fecha                    | no     | AAAA-MM-DD                                                     |
 * | nombre                   | sí     | instrumento o emisor                                           |
 * | pais                     | sí     | sigla (US) o "Estados Unidos" / "Chile"                        |
 * | tipo                     | sí     | compra, venta, dividendo, interes, otra, posicion             |
 * | monto_usd                | sí     | ver el significado según el tipo, en `Operacion`               |
 * | costo_usd                | no     | solo ventas; vacío no es cero                                  |
 * | impuesto_retenido_usd    | no     | retención en el exterior, en dólares                           |
 * | cantidad                 | no     | no se usa para calcular la renta                               |
 * | tax_id                   | no     | identificación tributaria extranjera                           |
 * | domicilio                | no     | el SII lo pide en códigos 10 y 21; no se busca solo            |
 * | ciudad                   | no     | igual que domicilio                                            |
 *
 * Montos: punto decimal (`1234.56`) o coma decimal (`1234,56`). Si hay
 * punto y coma, el último es el decimal (`1.234,56` o `1,234.56`).
 * Sin símbolo de moneda. Un punto solo es decimal, no miles: `1.234`
 * se lee como 1,234 dólares, no como 1234.
 *
 * También se aceptan alias (`name`, `country`, `amount`, `País`,
 * `Monto USD`) y separador coma, punto y coma o tabulación.
 *
 * Deuda: el CSV de Racional (`reporte-operaciones-stocks-2025.csv`) no
 * se importa. La guía lo describe por número de columna y sin encabezados,
 * pero en el repo no hay un archivo real. Adivinar los índices pondría
 * los montos en la columna equivocada.
 * Ver `scrapers/data/v2/F42/racional_1929.txt`.
 */

import Papa from "papaparse";
import { normalizarPais, type Operacion, type TipoOperacion } from "@/lib/tax/dj1929";

export type ImportacionCsv = {
  operaciones: Operacion[];
  errores: string[];
};

const ALIAS_ENCABEZADO: Record<string, string> = {
  fecha: "fecha",
  date: "fecha",
  nombre: "nombre",
  name: "nombre",
  instrumento: "nombre",
  "razon social": "nombre",
  pais: "pais",
  country: "pais",
  tipo: "tipo",
  type: "tipo",
  "monto usd": "monto_usd",
  monto: "monto_usd",
  amount: "monto_usd",
  usd: "monto_usd",
  "costo usd": "costo_usd",
  costo: "costo_usd",
  cost: "costo_usd",
  "cost basis": "costo_usd",
  "impuesto retenido usd": "impuesto_retenido_usd",
  "impuesto retenido": "impuesto_retenido_usd",
  impuesto: "impuesto_retenido_usd",
  retencion: "impuesto_retenido_usd",
  withholding: "impuesto_retenido_usd",
  cantidad: "cantidad",
  qty: "cantidad",
  quantity: "cantidad",
  shares: "cantidad",
  "tax id": "tax_id",
  taxid: "tax_id",
  domicilio: "domicilio",
  direccion: "domicilio",
  address: "domicilio",
  ciudad: "ciudad",
  city: "ciudad",
};

const ALIAS_TIPO: Record<string, TipoOperacion> = {
  compra: "compra",
  buy: "compra",
  venta: "venta",
  sell: "venta",
  dividendo: "dividendo",
  dividendos: "dividendo",
  dividend: "dividendo",
  interes: "interes",
  interest: "interes",
  otra: "otra",
  otras: "otra",
  other: "otra",
  posicion: "posicion",
  position: "posicion",
  cierre: "posicion",
  "valor cierre": "posicion",
};

const REQUERIDOS = ["nombre", "pais", "tipo", "monto_usd"] as const;

/** Ejemplo mínimo del formato propio. Sirve de documentación viva. */
export const FORMATO_CSV_GENERICO = `fecha,nombre,pais,tipo,monto_usd,costo_usd,impuesto_retenido_usd,cantidad,tax_id,domicilio,ciudad
2025-06-01,Apple,US,dividendo,12.50,,1.88,10,US-000000000,"One Apple Park Way",Cupertino
2025-11-02,Apple,US,venta,1500,1000,,10,US-000000000,,
2025-12-31,Apple,US,posicion,1800,,,,,,
`;

function normClave(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function preparar(csv: string): string {
  return csv.replace(/^\uFEFF/, "").replace(/^sep=.\r?\n/i, "");
}

/** El formato propio siempre nombra la columna del instrumento. */
function pareceEncabezado(texto: string): boolean {
  const primera = normClave(texto.split(/\r?\n/, 1)[0] ?? "");
  return (
    primera.includes("nombre") ||
    primera.includes("name") ||
    primera.includes("instrumento") ||
    primera.includes("razon social")
  );
}

/**
 * Lee un monto. Vacío → null. Texto que no es un número → null.
 * No acepta notación científica.
 */
export function interpretarMonto(raw: string): number | null {
  const limpio = raw.trim().replace(/\s/g, "").replace(/usd|us\$|\$/gi, "");
  if (!limpio) return null;

  let normalizado = limpio;
  const tieneComa = normalizado.includes(",");
  const tienePunto = normalizado.includes(".");
  if (tieneComa && tienePunto) {
    const ultimaComa = normalizado.lastIndexOf(",");
    const ultimoPunto = normalizado.lastIndexOf(".");
    const decimal = ultimaComa > ultimoPunto ? "," : ".";
    const miles = decimal === "," ? "." : ",";
    normalizado = normalizado.split(miles).join("").replace(decimal, ".");
  } else if (tieneComa) {
    normalizado = normalizado.replace(",", ".");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function celda(row: Record<string, string | undefined>, campo: string): string {
  return (row[campo] ?? "").trim();
}

/**
 * Convierte el CSV propio en operaciones. Las filas malas quedan en
 * `errores` y no entran al cálculo. No llama a la red.
 */
export function parseGenericCsv(csv: string): ImportacionCsv {
  const texto = preparar(csv);
  if (!texto.trim()) {
    return { operaciones: [], errores: ["El CSV está vacío."] };
  }
  if (!pareceEncabezado(texto)) {
    return {
      operaciones: [],
      errores: [
        "Faltan columnas: nombre, pais, tipo, monto_usd. El CSV de Racional, sin encabezados, no se importa por aquí.",
      ],
    };
  }

  const duplicados: string[] = [];
  const vistos = new Set<string>();
  const parsed = Papa.parse<Record<string, string | undefined>>(texto, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader(header, index) {
      const clave = normClave(header);
      if (!clave) return `__ignorar_${index}`;
      const canon = ALIAS_ENCABEZADO[clave] ?? clave;
      if (vistos.has(canon)) {
        duplicados.push(canon);
        return `${canon}__duplicada`;
      }
      vistos.add(canon);
      return canon;
    },
  });

  const errores = parsed.errors.map((error) => `CSV: ${error.message}`);
  if (duplicados.length > 0) {
    errores.push(`Hay columnas duplicadas: ${Array.from(new Set(duplicados)).join(", ")}.`);
    return { operaciones: [], errores };
  }

  const campos = new Set(parsed.meta.fields ?? []);
  const faltan = REQUERIDOS.filter((campo) => !campos.has(campo));
  if (faltan.length > 0) {
    errores.push(
      `Faltan columnas: ${faltan.join(", ")}. El CSV de Racional, sin encabezados, no se importa por aquí.`,
    );
    return { operaciones: [], errores };
  }

  const operaciones: Operacion[] = [];
  parsed.data.forEach((row, index) => {
    const fila = index + 1;
    const nombre = celda(row, "nombre");
    const paisRaw = celda(row, "pais");
    const tipoRaw = celda(row, "tipo");
    const montoRaw = celda(row, "monto_usd");
    if (!nombre && !paisRaw && !tipoRaw && !montoRaw) return;

    const problemas: string[] = [];
    if (!nombre) problemas.push("falta el nombre");
    const pais = normalizarPais(paisRaw);
    if (!pais) problemas.push("falta la sigla de país");
    const tipo = ALIAS_TIPO[normClave(tipoRaw)];
    if (!tipo) problemas.push("el tipo no es compra, venta, dividendo, interes, otra ni posicion");
    const montoUsd = interpretarMonto(montoRaw);
    if (montoUsd === null || montoUsd < 0) problemas.push("el monto en USD no es válido");

    const costoRaw = celda(row, "costo_usd");
    let costoUsd: number | undefined;
    if (costoRaw) {
      const costo = interpretarMonto(costoRaw);
      if (costo === null || costo < 0) problemas.push("el costo en USD no es válido");
      else costoUsd = costo;
    }

    const impuestoRaw = celda(row, "impuesto_retenido_usd");
    let impuestoRetenidoUsd: number | undefined;
    if (impuestoRaw) {
      const impuesto = interpretarMonto(impuestoRaw);
      if (impuesto === null || impuesto < 0) problemas.push("el impuesto retenido no es válido");
      else impuestoRetenidoUsd = impuesto;
    }

    const cantidadRaw = celda(row, "cantidad");
    let cantidad: number | undefined;
    if (cantidadRaw) {
      const n = interpretarMonto(cantidadRaw);
      if (n === null || n <= 0) problemas.push("la cantidad tiene que ser mayor que cero");
      else cantidad = n;
    }

    const fecha = celda(row, "fecha");
    if (problemas.length > 0 || !pais || !tipo || montoUsd === null) {
      errores.push(`Fila de datos ${fila}: ${problemas.join("; ")}.`);
      return;
    }

    const op: Operacion = { nombre, pais, tipo, montoUsd };
    if (fecha) op.fecha = fecha;
    if (costoUsd !== undefined) op.costoUsd = costoUsd;
    if (impuestoRetenidoUsd !== undefined) op.impuestoRetenidoUsd = impuestoRetenidoUsd;
    if (cantidad !== undefined) op.cantidad = cantidad;
    const taxId = celda(row, "tax_id");
    const domicilio = celda(row, "domicilio");
    const ciudad = celda(row, "ciudad");
    if (taxId) op.taxId = taxId;
    if (domicilio) op.domicilio = domicilio;
    if (ciudad) op.ciudad = ciudad;
    operaciones.push(op);
  });

  if (operaciones.length === 0 && errores.length === 0) {
    errores.push("El CSV no tiene operaciones.");
  }

  return { operaciones, errores };
}
