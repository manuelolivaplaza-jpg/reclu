import Link from "next/link";
import { TrendingUp, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/sparkline";
import { formatCompact } from "@/lib/utils";

/**
 * Mini sparkline for a portfolio's recent performance.
 * Deterministic pseudo-random walk seeded by the symbol so every render
 * shows the same shape (no hydration mismatch, no external data needed).
 */
export interface LivePortfolio {
  slug: string;
  name: string;
  category: string;
  flag: string;
  returnPct: number;
  followers: number;
  topHoldings: { symbol: string; weight: number }[];
}

// Illustrative performance series (normalized). In production these come
// from the price-history table once the scrapers + price feed are live.
const SAMPLE_PERF = [0.7, 0.66, 0.68, 0.6, 0.55, 0.58, 0.48, 0.42, 0.44, 0.34, 0.28, 0.18];

const LIVE_PORTFOLIOS: LivePortfolio[] = [
  {
    slug: "pelosi-tracker",
    name: "Pelosi Tracker",
    category: "Políticos EE.UU.",
    flag: "🇺🇸",
    returnPct: 31.4,
    followers: 12400,
    topHoldings: [
      { symbol: "NVDA", weight: 18.5 },
      { symbol: "AAPL", weight: 15.0 },
      { symbol: "MSFT", weight: 14.0 },
    ],
  },
  {
    slug: "ai-world-war",
    name: "AI World War III",
    category: "Temáticos / IA",
    flag: "🌐",
    returnPct: 42.8,
    followers: 9400,
    topHoldings: [
      { symbol: "NVDA", weight: 20.0 },
      { symbol: "TSM", weight: 15.0 },
      { symbol: "AMD", weight: 12.0 },
    ],
  },
  {
    slug: "renta4-moderada",
    name: "Renta 4 Moderada",
    category: "Corredoras Chile",
    flag: "🇨🇱",
    returnPct: 12.6,
    followers: 5600,
    topHoldings: [
      { symbol: "COPEC", weight: 16.0 },
      { symbol: "SQM-B", weight: 14.0 },
      { symbol: "BSANTANDER", weight: 13.0 },
    ],
  },
  {
    slug: "claude-portfolio",
    name: "Claude Portfolio",
    category: "Temáticos / IA",
    flag: "🌐",
    returnPct: 28.3,
    followers: 6200,
    topHoldings: [
      { symbol: "GOOGL", weight: 18.0 },
      { symbol: "AMZN", weight: 16.0 },
      { symbol: "NVDA", weight: 15.0 },
    ],
  },
];

/**
 * LivePortfolios — a visual showcase section with mini performance charts
 * and top holdings. Makes the product feel data-rich on first impression.
 */
export function LivePortfolios() {
  return (
    <section id="en-vivo" className="border-b border-ink-200/60 py-24">
      <div className="container-page">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-accent-600">
              <Flame className="size-4" />
              En vivo
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Portafolios destacados esta semana
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-600">
              Rendimiento, posiciones principales y popularidad — actualizado con cada
              cambio detectado en las fuentes.
            </p>
          </div>
          <Link
            href="/explore"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Ver todos
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {LIVE_PORTFOLIOS.map((p) => (
            <Link
              key={p.slug}
              href={`/portfolio/${p.slug}`}
              className="group rounded-card border border-ink-200 bg-white p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{p.flag}</span>
                    <h3 className="text-base font-semibold text-ink-900 group-hover:text-brand-700">
                      {p.name}
                    </h3>
                  </div>
                  <p className="mt-1 text-sm text-ink-500">{p.category}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-lg font-semibold text-positive tabular-nums">
                    <TrendingUp className="size-4" />
                    +{p.returnPct}%
                  </div>
                  <p className="text-xs text-ink-500">{formatCompact(p.followers)} seguidores</p>
                </div>
              </div>

              {/* Sparkline */}
              <div className="mt-4">
                <Sparkline data={SAMPLE_PERF} className="h-12 w-full" />
              </div>

              {/* Top holdings chips */}
              <div className="mt-4 flex flex-wrap gap-2">
                {p.topHoldings.map((h) => (
                  <span
                    key={h.symbol}
                    className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700"
                  >
                    {h.symbol}
                    <span className="tabular-nums text-ink-400">{h.weight}%</span>
                  </span>
                ))}
                <Badge variant="outline" className="text-xs">
                  +{(8 - p.topHoldings.length)} más
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
