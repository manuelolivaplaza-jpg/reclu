import { createClient } from "@/lib/supabase/server";
import type { ClosePoint } from "@/lib/trump-dice-page";

function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

/** Cierres reales (tabla prices, lectura pública) por símbolo desde una fecha. */
export async function getClosesSince(symbols: string[], since: string): Promise<Map<string, ClosePoint[]>> {
  const out = new Map<string, ClosePoint[]>();
  if (!isSupabaseLive() || symbols.length === 0) return out;
  try {
    const supabase = await createClient();
    for (const symbol of [...new Set(symbols)]) {
      const { data, error } = await supabase
        .from("prices")
        .select("date, close")
        .eq("symbol", symbol)
        .gte("date", since)
        .order("date", { ascending: true })
        .limit(1000);
      if (error || !Array.isArray(data)) continue;
      const pts: ClosePoint[] = [];
      for (const row of data as { date?: unknown; close?: unknown }[]) {
        const close = Number(row.close);
        if (typeof row.date === "string" && Number.isFinite(close) && close > 0) pts.push({ date: row.date, close });
      }
      out.set(symbol, pts);
    }
  } catch (err) {
    console.warn("[reclu] getClosesSince error:", err instanceof Error ? err.message : "unknown");
  }
  return out;
}
