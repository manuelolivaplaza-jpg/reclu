/**
 * Datos ilustrativos de portafolios para la home (hero + PortfolioStage).
 * Los mismos datos se usan en los dos sitios. Cuando Supabase esté conectado,
 * el detalle real vive en la DB; esto es la muestra de marketing.
 */

export interface ShowcasePortfolio {
  slug: string;
  name: string;
  meta: string;
  country: "US" | "CL" | "Global";
  returnPct: number;
  holdings: string[];
}

/** Tres filas del hero. */
export const HERO_PORTFOLIOS: ShowcasePortfolio[] = [
  {
    slug: "pelosi-tracker",
    name: "Pelosi Tracker",
    meta: "Políticos EE.UU.",
    country: "US",
    returnPct: 31.4,
    holdings: ["NVDA", "AAPL", "MSFT"],
  },
  {
    slug: "ai-world-war",
    name: "AI World War III",
    meta: "Temáticos",
    country: "Global",
    returnPct: 42.8,
    holdings: ["NVDA", "TSM", "AMD"],
  },
  {
    slug: "renta4-moderada",
    name: "Renta 4 Moderada",
    meta: "Corredoras Chile",
    country: "CL",
    returnPct: 12.6,
    holdings: ["COPEC", "SQM-B", "BSANTANDER"],
  },
];

/** Las del hero más una cuarta (PortfolioStage). */
export const STAGE_PORTFOLIOS: ShowcasePortfolio[] = [
  ...HERO_PORTFOLIOS,
  {
    slug: "claude-portfolio",
    name: "Claude Portfolio",
    meta: "Temáticos",
    country: "Global",
    returnPct: 28.3,
    holdings: ["GOOGL", "AMZN", "NVDA"],
  },
];

/**
 * Serie determinista para la sparkline, derivada del retorno.
 * Mismo shape en cada render (sin mismatch de hidratación).
 */
export function sparklineData(returnPct: number): number[] {
  let seed = Math.abs(Math.round(returnPct * 7)) + 3;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const upward = returnPct >= 0;
  const pts: number[] = [];
  let v = 0.5 + (rand() - 0.5) * 0.2;
  for (let i = 0; i < 12; i++) {
    // Trend follows the sign: positive returns climb, negative fall.
    v += (upward ? 1 : -1) * (0.03 + rand() * 0.04) + (rand() - 0.5) * 0.05;
    v = Math.max(0.05, Math.min(0.95, v));
    pts.push(v);
  }
  // End point must sit on the correct side so the stroke direction matches.
  pts[pts.length - 1] = upward ? 0.82 : 0.12;
  return pts;
}
