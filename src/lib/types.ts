/**
 * Domain types for reclu.cl — shared across the app, edge functions, and scrapers.
 * These mirror the Supabase schema in supabase/schema.sql.
 */

// ---- Enums ----
export type PortfolioCategory =
  | "political_us"
  | "thematic"
  | "broker_cl"
  | "public_disclosure"
  | "hedge_fund"
  | "model";

export type AlertType =
  | "new_trade"
  | "sold_trade"
  | "weight_change"
  | "mention"
  | "threshold"
  | "dividend"
  | "earnings"
  | "13f_update"
  | "scraper_error";

export type AlertSeverity = "low" | "medium" | "high";

export type Plan = "free" | "pro" | "elite";

// ---- Portfolios ----
export interface Portfolio {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: PortfolioCategory;
  /** Data source this portfolio tracks (e.g. "capitol_trades", "renta4"). */
  source: string;
  /** Owner/manager if applicable (e.g. "Nancy Pelosi", "Renta 4"). */
  manager: string | null;
  /** Country of origin for the tracked portfolio. */
  country: "US" | "CL" | "Global";
  /** Number of users following this portfolio. */
  followers: number;
  /** YTD or trailing performance if known. */
  return_ytd: number | null;
  /** Whether this portfolio requires a Pro plan to follow. */
  premium: boolean;
  /** Tags for search & filtering. */
  tags: string[];
  /** Cover image path under /covers (e.g. "05-algoritmo.png"), or null. */
  cover_image: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Holdings ----
export interface Holding {
  id: string;
  portfolio_id: string;
  /** Ticker or internal identifier for the asset. */
  symbol: string;
  name: string;
  /** Weight in the portfolio, 0–100. */
  weight: number;
  /** Previous weight, for change detection. */
  previous_weight: number | null;
  asset_class: "equity" | "fund" | "etf" | "cash" | "bond" | "other";
  /** CL-specific: exchange code (BCS, IPSA...). */
  exchange: string | null;
  currency: "USD" | "CLP" | "EUR";
  as_of: string;
  /** Price at disclosure (real market data, Fase 1). */
  price_at_disclosure: number | null;
  price_current: number | null;
  /** Computed return % (price_current vs price_at_disclosure). */
  return_pct: number | null;
}

// ---- Portfolio snapshots (Fase 3 charts) ----
export interface PortfolioSnapshot {
  id: string;
  portfolio_id: string;
  symbol: string;
  weight: number;
  as_of: string;
}

// ---- Prices (Fase 1) ----
export interface Price {
  symbol: string;
  date: string;
  close: number;
  currency: "USD" | "CLP" | "EUR";
}

// ---- Alerts ----
export interface Alert {
  id: string;
  portfolio_id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  /** AI-generated summary (OpenRouter). Null until generated. */
  summary: string | null;
  /** Raw change data that triggered the alert. */
  payload: Record<string, unknown>;
  created_at: string;
  /** Joined fields for display. */
  portfolio?: Pick<Portfolio, "id" | "slug" | "name">;
}

// ---- User follows ----
export interface Follow {
  user_id: string;
  portfolio_id: string;
  created_at: string;
}

// ---- User profile (mirrors `profiles` table) ----
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  plan: Plan;
  /** Stripe/customer id once billing is connected. */
  stripe_customer_id: string | null;
  alert_frequency: "realtime" | "daily" | "weekly";
  created_at: string;
  updated_at: string;
}

// ---- User's own portfolio (for comparison) ----
export interface UserHolding {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  weight: number;
  /** Whether added via CSV upload or manual entry. */
  source: "csv" | "manual";
  created_at: string;
}

// ---- Freemium limits ----
export const FREE_PLAN_FOLLOW_LIMIT = 2;
export const PRO_PLAN_FOLLOW_LIMIT = 15;
// Elite no lleva constante de límite: portafolios ilimitados.

/** Cualquier plan de pago (Pro o Elite). Compatible con `plan === "pro"` existente. */
export function isPaidPlan(plan?: string | null): boolean {
  return plan === "pro" || plan === "elite";
}

/** Solo el plan Elite (institucional, 13F, exportación). */
export function isElitePlan(plan?: string | null): boolean {
  return plan === "elite";
}

// ---- Category metadata (for UI labels / icons) ----
export const CATEGORY_META: Record<
  PortfolioCategory,
  { label: string; description: string }
> = {
  political_us: {
    label: "Políticos EE.UU.",
    description: "Trades de congresistas y funcionarios",
  },
  thematic: {
    label: "Temáticos / IA",
    description: "Tesis de inversión temáticas",
  },
  broker_cl: {
    label: "Corredoras Chile",
    description: "Carteras recomendadas de corredoras chilenas",
  },
  public_disclosure: {
    label: "Declaraciones públicas",
    description: "InfoProbidad y declaraciones de patrimonio",
  },
  hedge_fund: {
    label: "Hedge Funds",
    description: "Filings 13F y portafolios institucionales",
  },
  model: {
    label: "Modelo reclu",
    description: "Portafolios modelo construidos por el equipo",
  },
};
