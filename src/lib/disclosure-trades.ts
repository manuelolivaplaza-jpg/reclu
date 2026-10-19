import { createClient } from "@/lib/supabase/server";

export const OGE_TRUMP_PDF =
  "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/0BDCCCE7DE13AEFA85258E8A002DE2B5/$FILE/Donald-J-Trump.09.17.2026-278T.pdf";

export interface OgeTradeView {
  lineNo: number;
  symbol: string | null;
  description: string;
  side: "purchase" | "sale" | "exchange";
  transDate: string | null;
  transDateUncertain: boolean;
  reportPublished: string | null;
  amountMin: number | null;
  amountMax: number | null;
  reportUrl: string;
  status: "pendiente" | "verificada" | "descartada";
}

const PUBLISHED = "2026-10-08";

function draft(
  lineNo: number,
  symbol: string,
  description: string,
  transDate: string | null,
  uncertain: boolean,
  amountMin: number,
  amountMax: number,
): OgeTradeView {
  return {
    lineNo,
    symbol,
    description,
    side: "purchase",
    transDate,
    transDateUncertain: uncertain,
    reportPublished: PUBLISHED,
    amountMin,
    amountMax,
    reportUrl: OGE_TRUMP_PDF,
    status: "pendiente",
  };
}

/** Borrador OCR del informe del 17-09-2026. No está verificado. */
export const DEMO_OGE_TRADES: OgeTradeView[] = [
  draft(39, "VGK", "Vanguard FTSE Europe ETF", "2026-08-06", false, 1000001, 5000000),
  draft(40, "XLC", "Communication Services Select Sector SPDR", "2026-08-10", false, 1000001, 5000000),
  draft(57, "MSFT", "Microsoft Corp", null, true, 1000001, 5000000),
  draft(58, "MCD", "McDonald's Corp", "2026-08-10", false, 1000001, 5000000),
  draft(59, "CMCSA", "Comcast Corp", "2026-08-10", false, 1000001, 5000000),
  draft(381, "META", "Meta Platforms Inc", "2026-08-21", false, 5000001, 25000000),
  draft(382, "T", "AT&T Inc", null, true, 1000001, 5000000),
  draft(383, "COP", "ConocoPhillips", "2026-08-21", false, 1000001, 5000000),
  draft(384, "ABT", "Abbott Labs Inc", "2026-08-21", false, 1000001, 5000000),
  draft(385, "NFLX", "Netflix Inc", "2026-08-21", false, 1000001, 5000000),
  draft(386, "CVX", "Chevron Corp", "2026-08-21", false, 1000001, 5000000),
];

function live(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

export async function getVerifiedOgeTrades(): Promise<OgeTradeView[]> {
  if (!live()) return DEMO_OGE_TRADES;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("disclosure_trades")
      .select(
        "line_no, symbol, description, side, trans_date, trans_date_uncertain, report_published, amount_min, amount_max, report_url, status",
      )
      .eq("status", "verificada")
      .order("line_no", { ascending: true });
    if (error || !data) return [];
    return data.map((row) => ({
      lineNo: row.line_no ?? 0,
      symbol: row.symbol,
      description: row.description,
      side: row.side,
      transDate: row.trans_date,
      transDateUncertain: !!row.trans_date_uncertain,
      reportPublished: row.report_published,
      amountMin: row.amount_min === null ? null : Number(row.amount_min),
      amountMax: row.amount_max === null ? null : Number(row.amount_max),
      reportUrl: row.report_url,
      status: row.status,
    }));
  } catch {
    return [];
  }
}

export function formatUsdRange(min: number | null, max: number | null): string {
  const money = (value: number) =>
    `US$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(value)}`;
  if (min === null) return "Tramo no leído";
  if (max === null) return `${money(min)} o más`;
  return `${money(min)}–${money(max)}`;
}

export function formatClDate(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}-${month}-${year}`;
}
