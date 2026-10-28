/**
 * D43: tiempos de servidor para diagnosticar /explore. Solo loguea con
 * RECLU_TIMING=1 (apagado por defecto; no cambia el resultado).
 */
export async function timed<T>(label: string, work: Promise<T> | (() => Promise<T>)): Promise<T> {
  if (process.env.RECLU_TIMING !== "1") return typeof work === "function" ? work() : work;
  const t0 = performance.now();
  try {
    return await (typeof work === "function" ? work() : work);
  } finally {
    console.log(`[timing] ${label} ${Math.round(performance.now() - t0)}ms`);
  }
}
