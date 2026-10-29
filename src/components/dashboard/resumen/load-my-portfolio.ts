import { createClient } from "@/lib/supabase/server";
import { hasCurrentPortfolioConsent } from "@/lib/portfolio-consent";
import { isMyPortfolioEnabled } from "@/lib/portfolio-flags";
import { valuatePortfolio } from "@/lib/portfolio-valuation";

export interface MyPos {
  symbol: string;
  name: string;
  currency: "USD" | "CLP";
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
  dayPct: number | null;
}
export interface MyTotal {
  currency: "USD" | "CLP";
  value: number;
  pnl: number;
  pnlPct: number | null;
  dayPct: number | null;
}
export type MyPortfolioSummary =
  | { state: "disabled" | "no-consent" | "empty" }
  | { state: "ok"; totals: MyTotal[]; positions: MyPos[]; missingPrices: number };

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : n;
};

/** Misma lógica de lectura que /mi-portafolio (RLS + consentimiento vigente), con día = cierre vs cierre anterior. */
export async function loadMyPortfolioSummary(userId: string | null): Promise<MyPortfolioSummary> {
  if (!isMyPortfolioEnabled()) return { state: "disabled" };
  if (!userId) return { state: "no-consent" };
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("user_portfolio_settings")
    .select("consent_at, consent_version")
    .eq("user_id", userId)
    .maybeSingle();
  const s = settings as { consent_at: string | null; consent_version: string | null } | null;
  if (!hasCurrentPortfolioConsent(s?.consent_at ?? null, s?.consent_version ?? null)) return { state: "no-consent" };

  const { data } = await supabase
    .from("user_holdings")
    .select("symbol, name, quantity, avg_cost, currency, market")
    .eq("user_id", userId)
    .order("weight", { ascending: false });
  const rows = (data ?? []) as { symbol: string; name: string | null; quantity: unknown; avg_cost: unknown; currency: string | null; market: string | null }[];
  if (rows.length === 0) return { state: "empty" };

  const items = rows.map((r) => {
    const symbol = String(r.symbol).toUpperCase();
    const currency: "USD" | "CLP" = r.currency === "CLP" ? "CLP" : "USD";
    const cl = (r.market === "CL" || currency === "CLP") && !symbol.endsWith(".SN");
    return { r, symbol, currency, candidates: cl ? [`${symbol}.SN`, symbol] : [symbol] };
  });
  const symbols = [...new Set(items.flatMap((i) => i.candidates))];
  const closes = new Map<string, { close: number; prev: number | null; date: string }>();
  for (let i = 0; i < symbols.length; i += 8) {
    const chunk = symbols.slice(i, i + 8);
    const res = await Promise.all(
      chunk.map(async (sym) => {
        const { data: p } = await supabase.from("prices").select("close, date").eq("symbol", sym).order("date", { ascending: false }).limit(2);
        return { sym, p: (p ?? []) as { close: unknown; date: string }[] };
      }),
    );
    for (const { sym, p } of res) {
      const c = num(p[0]?.close);
      if (c === null || c <= 0) continue;
      const prev = num(p[1]?.close);
      closes.set(sym, { close: c, prev: prev && prev > 0 ? prev : null, date: p[0].date });
    }
  }

  const priced = items.map((i) => {
    const px = i.candidates.map((c) => closes.get(c)).find(Boolean) ?? null;
    return { ...i, px };
  });
  const val = valuatePortfolio(
    priced.map((i) => ({
      symbol: i.symbol,
      quantity: num(i.r.quantity),
      avgCost: num(i.r.avg_cost),
      currency: i.currency,
      price: i.px?.close ?? null,
      priceDate: i.px?.date ?? null,
    })),
  );

  const positions: MyPos[] = val.positions.map((v, k) => {
    const px = priced[k].px;
    return {
      symbol: v.symbol,
      name: priced[k].r.name ?? "",
      currency: v.currency === "CLP" ? "CLP" : "USD",
      value: v.value,
      pnl: v.pnl,
      pnlPct: v.pnlPct,
      dayPct: px && px.prev ? (px.close / px.prev - 1) * 100 : null,
    };
  });

  const totals: MyTotal[] = val.totals.map((t) => {
    let now = 0;
    let before = 0;
    priced.forEach((i, k) => {
      const q = num(i.r.quantity);
      if (i.currency !== t.currency || !q || !i.px?.prev) return;
      now += q * i.px.close;
      before += q * i.px.prev;
      void k;
    });
    return {
      currency: t.currency === "CLP" ? "CLP" : "USD",
      value: t.totalValue,
      pnl: t.pnl,
      pnlPct: t.pnlPct,
      dayPct: before > 0 ? (now / before - 1) * 100 : null,
    };
  });

  return {
    state: "ok",
    totals,
    positions: positions.filter((p) => p.value !== null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    missingPrices: val.totals.reduce((a, t) => a + t.missingPrices, 0),
  };
}
