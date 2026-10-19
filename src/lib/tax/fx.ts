/**
 * Conversión a pesos para la DJ 1929.
 *
 * Quien declara ingresa el tipo de cambio. Este módulo no consulta al
 * Banco Central ni guarda un dólar observado: las instrucciones del SII
 * piden la paridad del 31 de diciembre, y ese número cambia cada año.
 */

const NUDGE = 1e-8;

/**
 * Centavos de dólar, como entero.
 * Medio centavo redondea lejos de cero. El ajuste evita que 1,015 * 100
 * caiga en 101,4999… por el binario de IEEE 754.
 */
export function centavosUsd(montoUsd: number): number {
  if (!Number.isFinite(montoUsd)) {
    throw new Error("El monto en dólares no es un número finito.");
  }
  const signo = montoUsd < 0 ? -1 : 1;
  return signo * Math.round(Math.abs(montoUsd) * 100 + NUDGE);
}

/** Rechaza cero, negativos y cualquier valor que no sea un tipo de cambio usable. */
export function assertTipoCambio(clpPorUsd: number): void {
  if (!Number.isFinite(clpPorUsd) || clpPorUsd <= 0) {
    throw new Error(
      "Ingresa el tipo de cambio en pesos por dólar, mayor que cero. No se usa un dólar observado de ejemplo.",
    );
  }
}

/**
 * Pesos enteros. La sección B de la DJ 1929 se declara en pesos.
 * `centavos` es un entero (ver `centavosUsd`).
 */
export function centavosAClp(centavos: number, clpPorUsd: number): number {
  assertTipoCambio(clpPorUsd);
  if (!Number.isInteger(centavos)) {
    throw new Error("Los centavos tienen que ser un entero.");
  }
  return Math.round((centavos * clpPorUsd) / 100);
}

/** Atajo cuando el monto todavía está en dólares. */
export function usdAClp(montoUsd: number, clpPorUsd: number): number {
  return centavosAClp(centavosUsd(montoUsd), clpPorUsd);
}
