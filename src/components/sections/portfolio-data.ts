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
  /** D40: niveles reales para la sparkline (sin dato, no se dibuja). */
  spark?: number[];
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
