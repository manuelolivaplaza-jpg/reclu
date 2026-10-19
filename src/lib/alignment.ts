/**
 * Alineación de carteras — lógica pura, sin dependencias ni acceso a datos.
 *
 * Compara los holdings del usuario con los de un portafolio seguido
 * (Pelosi, Buffett, Renta 4...) y entrega:
 *  - similarityPct: % de similitud (100 = carteras idénticas en pesos).
 *  - missing: activos presentes en el objetivo pero no en la cartera del
 *    usuario ("te falta X").
 *  - excess: activos con más peso del necesario ("te sobra Y").
 *  - weightDiffs: diferencia de peso por símbolo compartido.
 *  - matchedWeight: capital ya alineado con el objetivo.
 *
 * Todo es información descriptiva. Reclu no ejecuta órdenes ni recomienda
 * comprar o vender; el usuario decide.
 */

export interface WeightedHolding {
  symbol: string;
  weight: number;
}

export interface AlignmentDiff {
  symbol: string;
  /** Peso en el objetivo (portafolio seguido). */
  targetWeight: number;
  /** Peso en la cartera del usuario. */
  userWeight: number;
  /** Diferencia objetivo - usuario (positivo => falta, negativo => sobra). */
  delta: number;
}

export interface AlignmentResult {
  /** 0–100: 100 = pesos idénticos tras normalizar ambas carteras. */
  similarityPct: number;
  /** Suma de pesos del objetivo que la cartera del usuario ya cubre (0–100). */
  matchedWeightPct: number;
  /** Activo en el objetivo, ausente en la cartera del usuario. */
  missing: AlignmentDiff[];
  /** Activo presente pero con peso sobre el objetivo (delta < 0). */
  excess: AlignmentDiff[];
  /** Todos los símbolos compartidos con su diferencia de peso. */
  weightDiffs: AlignmentDiff[];
  /** Nº de símbolos en común. */
  sharedCount: number;
  /** Nº de símbolos del objetivo. */
  targetCount: number;
  /** Motivos cuando no se puede calcular (carteras vacías). */
  reasons: string[];
}

/** Umbral por defecto (0–100) bajo el cual se sugiere una alerta de desalineación. */
export const DEFAULT_ALIGNMENT_ALERT_THRESHOLD = 60;
/** Diferencia de peso (pp) a partir de la cual un activo se considera desalineado. */
export const DEFAULT_ALIGNMENT_DIFF_THRESHOLD = 1;

/** Normaliza símbolos (trim + mayúsculas) y suma pesos duplicados. */
export function normalizeHoldings(holdings: WeightedHolding[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const holding of holdings) {
    const symbol = holding.symbol.trim().toUpperCase();
    if (!symbol) continue;
    const weight = Number.isFinite(holding.weight) ? holding.weight : 0;
    map.set(symbol, (map.get(symbol) ?? 0) + weight);
  }
  return map;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Similitud de carteras: suma de los MENORES pesos por símbolo compartido
 * (intersección ponderada), expresada en % del total normalizado.
 * 100 => mismo conjunto y mismos pesos relativos.
 */
export function computeAlignment(
  userHoldings: WeightedHolding[],
  targetHoldings: WeightedHolding[],
  options?: { diffThresholdPp?: number },
): AlignmentResult {
  const diffThreshold = options?.diffThresholdPp ?? DEFAULT_ALIGNMENT_DIFF_THRESHOLD;
  const reasons: string[] = [];
  const result: AlignmentResult = {
    similarityPct: 0,
    matchedWeightPct: 0,
    missing: [],
    excess: [],
    weightDiffs: [],
    sharedCount: 0,
    targetCount: 0,
    reasons,
  };

  const userMap = normalizeHoldings(userHoldings);
  const targetMap = normalizeHoldings(targetHoldings);
  result.targetCount = targetMap.size;

  if (targetMap.size === 0) {
    reasons.push("El portafolio objetivo no tiene composición publicada.");
    return result;
  }
  if (userMap.size === 0) {
    reasons.push("Tu cartera está vacía: agrega activos para comparar.");
    return result;
  }

  // Normalizar cada cartera a 100 (los CSV suelen venir con pesos arbitrarios).
  const userTotal = [...userMap.values()].reduce((s, v) => s + v, 0);
  const targetTotal = [...targetMap.values()].reduce((s, v) => s + v, 0);
  if (userTotal <= 0 || targetTotal <= 0) {
    reasons.push("Los pesos no suman un total positivo.");
    return result;
  }

  const userNorm = new Map([...userMap].map(([s, w]) => [s, (w / userTotal) * 100]));
  const targetNorm = new Map([...targetMap].map(([s, w]) => [s, (w / targetTotal) * 100]));

  let overlap = 0;
  const missing: AlignmentDiff[] = [];
  const excess: AlignmentDiff[] = [];
  const weightDiffs: AlignmentDiff[] = [];
  let sharedCount = 0;

  for (const [symbol, targetWeight] of targetNorm) {
    const userWeight = userNorm.get(symbol) ?? 0;
    const delta = targetWeight - userWeight;
    if (userWeight > 0) {
      sharedCount++;
      overlap += Math.min(targetWeight, userWeight);
      weightDiffs.push({ symbol, targetWeight, userWeight, delta });
      if (delta <= -diffThreshold) excess.push({ symbol, targetWeight, userWeight, delta });
    } else {
      missing.push({ symbol, targetWeight, userWeight: 0, delta: targetWeight });
    }
  }

  // Sobrantes: activos del usuario que no están en el objetivo.
  for (const [symbol, userWeight] of userNorm) {
    if (!targetNorm.has(symbol)) {
      excess.push({ symbol, targetWeight: 0, userWeight, delta: -userWeight });
    }
  }

  missing.sort((a, b) => b.delta - a.delta);
  excess.sort((a, b) => a.delta - b.delta);
  weightDiffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  result.similarityPct = round1(Math.max(0, Math.min(100, overlap)));
  result.matchedWeightPct = round1(Math.max(0, Math.min(100, overlap)));
  result.missing = missing;
  result.excess = excess;
  result.weightDiffs = weightDiffs;
  result.sharedCount = sharedCount;

  return result;
}

/**
 * ¿La similitud cayó bajo el umbral y conviene avisar al usuario?
 * Función reutilizable: la edge de alertas puede llamarla con la similitud
 * ya calculada y el umbral configurado por usuario (columna
 * alignment_alert_threshold en follows, migración 011).
 */
export function shouldAlertAlignment(options: {
  similarityPct: number;
  threshold?: number;
}): { alert: boolean; similarityPct: number; threshold: number } {
  const threshold = options.threshold ?? DEFAULT_ALIGNMENT_ALERT_THRESHOLD;
  return {
    alert: options.similarityPct < threshold,
    similarityPct: options.similarityPct,
    threshold,
  };
}
