/**
 * Resumen de la DJ 1929 a partir de las operaciones del año.
 *
 * Corre en el navegador y no guarda nada: no hay RUT, ni red, ni base de
 * datos. No calcula el impuesto a pagar ni el tope del crédito del
 * artículo 41 A. Solo ordena los montos que el SII pide en la sección B
 * (instrucciones AT2025):
 *
 *   10 dividendos, 11 intereses, 13 ganancias de capital, 21 otras rentas.
 *
 * El monto al 31.12 sale únicamente de filas `posicion` (valor de mercado
 * que ingresa la persona). El costo de una compra no se usa como ese valor.
 * La renta de una venta sale de `costoUsd`. Si falta, no se inventa.
 * Las pérdidas van en positivo, sin signo menos, como pide el SII.
 * El impuesto retenido no se resta de la renta: la renta es bruta.
 *
 * TODO(F16): la pantalla que muestre este resumen tiene que incluir
 * `<LegalNotice kind="tax" />` de `src/components/legal/legal-notice.tsx`
 * (en esta rama ese archivo no está). No crearlo desde aquí.
 */

import { assertTipoCambio, centavosAClp, centavosUsd } from "@/lib/tax/fx";

/** Códigos de la columna Operación que arma este asistente. */
export const CODIGOS_OPERACION = [10, 11, 13, 21] as const;
export type CodigoOperacion = (typeof CODIGOS_OPERACION)[number];

/**
 * Relación de las instrucciones AT2025: no existe relación.
 * Racional anota 9. Fintual muestra "99" en su guía; el código de la
 * columna, en el texto oficial, es 9. No se calcula una relación real.
 */
export const RELACION_SIN_RELACION = 9;

/**
 * Participación que Fintual y Racional dicen anotar en una acción o ETF.
 * No es el porcentaje real sobre la empresa.
 */
export const PARTICIPACION_POR_DEFECTO = 0;

/**
 * Texto para la interfaz. No sustituye el aviso legal de F16.
 * TODO(F16): mostrar además `<LegalNotice kind="tax" />`.
 */
export const DJ1929_NO_CALCULA_IMPUESTO =
  "Estos montos ordenan lo que podría informarse en la DJ 1929. No calculan el impuesto a pagar ni reemplazan la declaración en el SII.";

export const TIPOS_OPERACION = [
  "compra",
  "venta",
  "dividendo",
  "interes",
  "otra",
  "posicion",
] as const;
export type TipoOperacion = (typeof TIPOS_OPERACION)[number];

/**
 * Una operación del año, cargada a mano o por CSV.
 * Los montos van en dólares. El tipo de cambio no vive aquí.
 */
export type Operacion = {
  /** Nombre o razón social del emisor. */
  nombre: string;
  /** Sigla de país de la DJ (por ejemplo US). */
  pais: string;
  /** AAAA-MM-DD. Si se pide un año y no hay fecha, la fila igual se incluye. */
  fecha?: string;
  tipo: TipoOperacion;
  /**
   * Dólares.
   * compra: lo invertido. venta: lo recibido. dividendo, interes y otra:
   * renta bruta. posicion: valor de mercado al 31.12.
   */
  montoUsd: number;
  /** Costo en dólares de lo vendido. Vacío no es cero: sin este dato no hay renta. */
  costoUsd?: number;
  /** Impuesto retenido en el exterior, en dólares. No se resta de la renta. */
  impuestoRetenidoUsd?: number;
  /** No se usa para estimar el costo. Queda guardado en la fila por si el CSV lo trae. */
  cantidad?: number;
  taxId?: string;
  /** El SII lo pide en los códigos 10 y 21. No se completa solo. */
  domicilio?: string;
  /** El SII lo pide en los códigos 10 y 21. No se completa solo. */
  ciudad?: string;
};

/** Una fila de la sección B, ya agrupada por instrumento y código. */
export type ResumenInstrumento = {
  nombre: string;
  pais: string;
  codigo: CodigoOperacion;
  monto31DicUsd: number;
  monto31DicClp: number;
  /** Bruta. Cero significa dejar el casillero vacío en el formulario. */
  rentasUsd: number;
  rentasClp: number;
  /** Positiva, sin signo menos. Solo el código 13 puede traer pérdidas. */
  perdidasUsd: number;
  perdidasClp: number;
  impuestoRetenidoUsd: number;
  impuestoRetenidoClp: number;
  taxId?: string;
  domicilio?: string;
  ciudad?: string;
};

/** Sumas de la sección C, tomadas de las filas ya redondeadas a pesos. */
export type TotalesDJ1929 = {
  monto31DicUsd: number;
  monto31DicClp: number;
  rentasUsd: number;
  rentasClp: number;
  perdidasUsd: number;
  perdidasClp: number;
  impuestoRetenidoUsd: number;
  impuestoRetenidoClp: number;
  casos: number;
};

export type ResumenDJ1929 = {
  filas: ResumenInstrumento[];
  totales: TotalesDJ1929;
  avisos: string[];
};

/** Tope para no perder precisión al pasar dólares a centavos. */
const MAX_USD = 1_000_000_000_000;

const PAISES_LARGOS: Record<string, string> = {
  us: "US",
  usa: "US",
  eeuu: "US",
  "estados unidos": "US",
  "united states": "US",
  "u s": "US",
  cl: "CL",
  chile: "CL",
};

type Cubo = {
  rentas: number;
  perdidas: number;
  impuesto: number;
  monto31Dic: number;
};

type Grupo = {
  nombre: string;
  pais: string;
  taxId?: string;
  taxIdDistinto: boolean;
  domicilio?: string;
  domicilioDistinto: boolean;
  ciudad?: string;
  ciudadDistinto: boolean;
  posiciones: number;
  compras: number;
  ventas: number;
  ventasSinCosto: number;
  cubos: Record<CodigoOperacion, Cubo>;
};

function cuboVacio(): Cubo {
  return { rentas: 0, perdidas: 0, impuesto: 0, monto31Dic: 0 };
}

function normClave(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Sigla de 2 o 3 letras, o un nombre conocido (Estados Unidos → US). */
export function normalizarPais(raw: string): string | null {
  const clave = normClave(raw);
  if (!clave) return null;
  const conocido = PAISES_LARGOS[clave];
  if (conocido) return conocido;
  const compacto = clave.replace(/[^a-z]/g, "");
  if (/^[a-z]{2,3}$/.test(compacto)) return compacto.toUpperCase();
  return null;
}

function claveInstrumento(nombre: string, pais: string): string {
  const base = nombre.trim().replace(/\s+/g, " ").replace(/\.+$/, "").toLowerCase();
  return `${base}|${pais}`;
}

function anioDe(fecha: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return year;
}

function validarAnio(anio: number | undefined): void {
  if (anio === undefined) return;
  if (!Number.isInteger(anio) || anio < 1990 || anio > 2100) {
    throw new Error("El año comercial tiene que ser un entero entre 1990 y 2100.");
  }
}

function centavosDe(montoUsd: number): number | null {
  if (!Number.isFinite(montoUsd) || Math.abs(montoUsd) > MAX_USD) return null;
  return centavosUsd(montoUsd);
}

function usdDesde(centavos: number): number {
  return centavos / 100;
}

function tomarTexto(
  actual: string | undefined,
  distinto: boolean,
  incoming: string | undefined,
): { valor: string | undefined; distinto: boolean } {
  const limpio = incoming?.trim();
  if (!limpio) return { valor: actual, distinto };
  if (!actual) return { valor: limpio, distinto };
  if (actual !== limpio) return { valor: actual, distinto: true };
  return { valor: actual, distinto };
}

function grupoNuevo(nombre: string, pais: string): Grupo {
  return {
    nombre,
    pais,
    taxIdDistinto: false,
    domicilioDistinto: false,
    ciudadDistinto: false,
    posiciones: 0,
    compras: 0,
    ventas: 0,
    ventasSinCosto: 0,
    cubos: {
      10: cuboVacio(),
      11: cuboVacio(),
      13: cuboVacio(),
      21: cuboVacio(),
    },
  };
}

function filaDesde(
  grupo: Grupo,
  codigo: CodigoOperacion,
  clpPorUsd: number,
): ResumenInstrumento | null {
  const cubo = grupo.cubos[codigo];
  if (cubo.rentas === 0 && cubo.perdidas === 0 && cubo.impuesto === 0 && cubo.monto31Dic === 0) {
    return null;
  }
  const llevaDomicilio = codigo === 10 || codigo === 21;
  return {
    nombre: grupo.nombre,
    pais: grupo.pais,
    codigo,
    monto31DicUsd: usdDesde(cubo.monto31Dic),
    monto31DicClp: centavosAClp(cubo.monto31Dic, clpPorUsd),
    rentasUsd: usdDesde(cubo.rentas),
    rentasClp: centavosAClp(cubo.rentas, clpPorUsd),
    perdidasUsd: usdDesde(cubo.perdidas),
    perdidasClp: centavosAClp(cubo.perdidas, clpPorUsd),
    impuestoRetenidoUsd: usdDesde(cubo.impuesto),
    impuestoRetenidoClp: centavosAClp(cubo.impuesto, clpPorUsd),
    taxId: grupo.taxId,
    domicilio: llevaDomicilio ? grupo.domicilio : undefined,
    ciudad: llevaDomicilio ? grupo.ciudad : undefined,
  };
}

function totalesDe(filas: readonly ResumenInstrumento[]): TotalesDJ1929 {
  const totales: TotalesDJ1929 = {
    monto31DicUsd: 0,
    monto31DicClp: 0,
    rentasUsd: 0,
    rentasClp: 0,
    perdidasUsd: 0,
    perdidasClp: 0,
    impuestoRetenidoUsd: 0,
    impuestoRetenidoClp: 0,
    casos: filas.length,
  };
  for (const fila of filas) {
    totales.monto31DicUsd = usdDesde(centavosUsd(totales.monto31DicUsd) + centavosUsd(fila.monto31DicUsd));
    totales.monto31DicClp += fila.monto31DicClp;
    totales.rentasUsd = usdDesde(centavosUsd(totales.rentasUsd) + centavosUsd(fila.rentasUsd));
    totales.rentasClp += fila.rentasClp;
    totales.perdidasUsd = usdDesde(centavosUsd(totales.perdidasUsd) + centavosUsd(fila.perdidasUsd));
    totales.perdidasClp += fila.perdidasClp;
    totales.impuestoRetenidoUsd = usdDesde(
      centavosUsd(totales.impuestoRetenidoUsd) + centavosUsd(fila.impuestoRetenidoUsd),
    );
    totales.impuestoRetenidoClp += fila.impuestoRetenidoClp;
  }
  return totales;
}

function etiqueta(grupo: Grupo): string {
  return `${grupo.nombre} (${grupo.pais})`;
}

/**
 * Agrupa las operaciones por instrumento y arma las filas de la sección B
 * más los totales de la sección C. `clpPorUsd` es el tipo de cambio que
 * ingresa la persona (pesos por un dólar al 31.12).
 */
export function resumirInstrumentos(
  operaciones: readonly Operacion[],
  clpPorUsd: number,
  opciones?: { anio?: number },
): ResumenDJ1929 {
  assertTipoCambio(clpPorUsd);
  validarAnio(opciones?.anio);

  const avisos: string[] = [];
  const grupos = new Map<string, Grupo>();

  operaciones.forEach((op, index) => {
    const n = index + 1;
    const nombre = op.nombre?.trim().replace(/\s+/g, " ") ?? "";
    const pais = normalizarPais(op.pais ?? "");
    const quien = nombre || `fila ${n}`;
    if (!nombre || !pais) {
      avisos.push(`Operación ${n} (${quien}): faltan el nombre o la sigla de país.`);
      return;
    }

    if (!TIPOS_OPERACION.includes(op.tipo)) {
      avisos.push(`Operación ${n} (${nombre}): tipo desconocido.`);
      return;
    }

    const monto = centavosDe(op.montoUsd);
    if (monto === null || monto < 0) {
      avisos.push(
        `Operación ${n} (${nombre}): el monto en USD tiene que ser un número entre cero y ${MAX_USD}.`,
      );
      return;
    }

    let costo: number | undefined;
    if (op.costoUsd !== undefined) {
      const leido = centavosDe(op.costoUsd);
      if (leido === null || leido < 0) {
        avisos.push(`Operación ${n} (${nombre}): el costo en USD tiene que ser cero o más.`);
        return;
      }
      costo = leido;
    }

    let impuesto = 0;
    if (op.impuestoRetenidoUsd !== undefined) {
      const leido = centavosDe(op.impuestoRetenidoUsd);
      if (leido === null || leido < 0) {
        avisos.push(`Operación ${n} (${nombre}): el impuesto retenido en USD tiene que ser cero o más.`);
        return;
      }
      impuesto = leido;
    }

    const fecha = op.fecha?.trim();
    if (fecha) {
      const anioOp = anioDe(fecha);
      if (anioOp === null) {
        avisos.push(`Operación ${n} (${nombre}): la fecha ${fecha} no es válida. Usa AAAA-MM-DD.`);
        return;
      }
      if (opciones?.anio !== undefined && anioOp !== opciones.anio) {
        avisos.push(`Operación ${n} (${nombre}): es de ${anioOp} y el resumen es del ${opciones.anio}.`);
        return;
      }
    } else if (opciones?.anio !== undefined) {
      avisos.push(`Operación ${n} (${nombre}): no tiene fecha y se incluyó igual en ${opciones.anio}.`);
    }

    const clave = claveInstrumento(nombre, pais);
    const grupo = grupos.get(clave) ?? grupoNuevo(nombre, pais);
    const tax = tomarTexto(grupo.taxId, grupo.taxIdDistinto, op.taxId);
    grupo.taxId = tax.valor;
    grupo.taxIdDistinto = tax.distinto;
    const domicilio = tomarTexto(grupo.domicilio, grupo.domicilioDistinto, op.domicilio);
    grupo.domicilio = domicilio.valor;
    grupo.domicilioDistinto = domicilio.distinto;
    const ciudad = tomarTexto(grupo.ciudad, grupo.ciudadDistinto, op.ciudad);
    grupo.ciudad = ciudad.valor;
    grupo.ciudadDistinto = ciudad.distinto;

    if (op.tipo === "compra") {
      grupo.compras += 1;
      if (impuesto > 0) {
        avisos.push(
          `Operación ${n} (${nombre}): el impuesto de una compra no se informa como impuesto a la remesa.`,
        );
      }
    } else if (op.tipo === "posicion") {
      grupo.posiciones += 1;
      grupo.cubos[13].monto31Dic += monto;
      if (impuesto > 0) {
        avisos.push(
          `Operación ${n} (${nombre}): el impuesto de un valor al 31.12 no se informa como impuesto a la remesa.`,
        );
      }
    } else if (op.tipo === "venta") {
      grupo.ventas += 1;
      if (costo === undefined) {
        grupo.ventasSinCosto += 1;
      } else {
        const diff = monto - costo;
        if (diff > 0) grupo.cubos[13].rentas += diff;
        else if (diff < 0) grupo.cubos[13].perdidas += -diff;
      }
      grupo.cubos[13].impuesto += impuesto;
    } else if (op.tipo === "dividendo") {
      grupo.cubos[10].rentas += monto;
      grupo.cubos[10].impuesto += impuesto;
    } else if (op.tipo === "interes") {
      grupo.cubos[11].rentas += monto;
      grupo.cubos[11].impuesto += impuesto;
    } else {
      grupo.cubos[21].rentas += monto;
      grupo.cubos[21].impuesto += impuesto;
    }

    grupos.set(clave, grupo);
  });

  const filas: ResumenInstrumento[] = [];
  for (const grupo of grupos.values()) {
    const quien = etiqueta(grupo);
    if (grupo.posiciones > 1) {
      avisos.push(`${quien}: se sumaron ${grupo.posiciones} valores al 31.12.`);
    }
    if (grupo.ventasSinCosto > 0) {
      avisos.push(
        `${quien}: ${grupo.ventasSinCosto} venta(s) sin costo en USD. No se calculó su renta ni su pérdida.`,
      );
    }
    if (grupo.posiciones === 0 && (grupo.compras > 0 || grupo.ventas > 0)) {
      avisos.push(
        `${quien}: no hay valor al 31.12. El monto actualizado queda en 0. El costo de las compras no se usa como ese valor.`,
      );
    }
    if (grupo.cubos[13].rentas > 0 && grupo.cubos[13].perdidas > 0) {
      avisos.push(`${quien}: hay ganancias y pérdidas de ventas distintas. No se netean.`);
    }
    if (grupo.taxIdDistinto) {
      avisos.push(`${quien}: hay más de un Tax-ID. Se usó el primero.`);
    }
    for (const codigo of CODIGOS_OPERACION) {
      const cubo = grupo.cubos[codigo];
      if (cubo.impuesto > cubo.rentas && cubo.impuesto > 0) {
        avisos.push(
          `${quien}: el impuesto retenido del código ${codigo} es mayor que la renta. No se calcula el tope del crédito.`,
        );
      }
      const fila = filaDesde(grupo, codigo, clpPorUsd);
      if (!fila) continue;
      if ((codigo === 10 || codigo === 21) && (!fila.domicilio || !fila.ciudad)) {
        avisos.push(`${quien}: el código ${codigo} pide domicilio y ciudad en la DJ 1929. No se inventan.`);
      }
      filas.push(fila);
    }
  }

  filas.sort(
    (a, b) =>
      a.nombre.localeCompare(b.nombre, "es") || a.pais.localeCompare(b.pais) || a.codigo - b.codigo,
  );

  return { filas, totales: totalesDe(filas), avisos };
}
