import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries";
import { isMyPortfolioEnabled } from "@/lib/portfolio-flags";
import { getPlan, portfolioLimitsFor } from "@/lib/plans";
import { PortfolioConsent } from "@/components/portfolio-consent";
import { hasCurrentPortfolioConsent } from "@/lib/portfolio-consent";
import { LegalNotice } from "@/components/legal/legal-notice";
import { PortfolioEditor } from "@/components/my-portfolio/portfolio-editor";
import type { EditablePosition } from "@/components/my-portfolio/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Mi portafolio" };
// Ruta protegida por auth y detrás de MY_PORTFOLIO_ENABLED.
export const instant = false;

interface HoldingRow {
  symbol: string;
  name: string | null;
  quantity: number | string | null;
  avg_cost: number | string | null;
  currency: string | null;
  market: string | null;
}

interface PriceRow {
  close: number | string;
  currency: string | null;
  date: string;
}

interface LatestPrice {
  close: number;
  currency: string | null;
  date: string;
}

/** numeric de Postgres puede llegar como string según el driver: normaliza. */
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCurrency(value: string | null | undefined): "USD" | "CLP" {
  return value === "CLP" ? "CLP" : "USD";
}

function toMarket(value: string | null | undefined): "US" | "CL" | null {
  return value === "US" || value === "CL" ? value : null;
}

/** `prices.py` guarda los tickers chilenos con sufijo .SN (Yahoo). */
function priceSymbolFor(
  symbol: string,
  market: "US" | "CL" | null,
  currency: "USD" | "CLP",
): string {
  return (market === "CL" || currency === "CLP") && !symbol.endsWith(".SN")
    ? `${symbol}.SN`
    : symbol;
}

/**
 * Último cierre por símbolo. Se consulta de a 8 en paralelo para no abrir
 * cientos de requests si la cartera es grande. Sin precio se omite: la tabla
 * mostrará "sin precio".
 */
async function loadLatestPrices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  symbols: string[],
): Promise<Map<string, LatestPrice>> {
  const prices = new Map<string, LatestPrice>();
  const CHUNK = 8;

  for (let index = 0; index < symbols.length; index += CHUNK) {
    const chunk = symbols.slice(index, index + CHUNK);
    const results = await Promise.all(
      chunk.map(async (symbol) => {
        const { data, error } = await supabase
          .from("prices")
          .select("close, currency, date")
          .eq("symbol", symbol)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn("[reclu] prices:", error.message);
          return null;
        }
        return { symbol, row: data as PriceRow | null };
      }),
    );

    for (const result of results) {
      if (!result?.row) continue;
      const close = toNumber(result.row.close);
      if (close === null || close <= 0) continue;
      prices.set(result.symbol, {
        close,
        currency: result.row.currency ?? null,
        date: result.row.date,
      });
    }
  }

  return prices;
}

/**
 * /mi-portafolio — tabla de posiciones con P&L, alta/edición, quitar,
 * importación CSV existente (/compare) y exportación Elite.
 *
 * Todo detrás de `MY_PORTFOLIO_ENABLED`; con el flag apagado la ruta es 404.
 * La lectura usa el cliente de sesión para que la RLS (auth.uid() = user_id)
 * sea la última defensa. Sin consentimiento vigente solo se muestra el
 * consentimiento de F75, nunca la tabla editable.
 */
export default async function MyPortfolioPage() {
  // Cookies de sesión + flag: la ruta nunca se prerenderiza.
  await connection();
  if (!isMyPortfolioEnabled()) notFound();

  const profile = await getProfile();
  if (!profile) redirect("/login?next=/mi-portafolio");

  const supabase = await createClient();
  const limits = portfolioLimitsFor(profile.plan, profile.trial_ends_at);
  const planName = getPlan(limits.plan).name;

  const { data: settings, error: settingsError } = await supabase
    .from("user_portfolio_settings")
    .select("consent_at, consent_version")
    .eq("user_id", profile.id)
    .maybeSingle();
  if (settingsError) {
    console.warn("[reclu] user_portfolio_settings:", settingsError.message);
  }
  const consentRow = settings as
    | { consent_at: string | null; consent_version: string | null }
    | null;
  const storedConsentAt = consentRow?.consent_at ?? null;
  const storedConsentVersion = consentRow?.consent_version ?? null;
  // Solo cuenta el consentimiento del texto vigente (F75B): con una version
  // vieja se pide aceptar de nuevo y no se leen las posiciones.
  const consentAt = hasCurrentPortfolioConsent(storedConsentAt, storedConsentVersion)
    ? storedConsentAt
    : null;

  let positions: EditablePosition[] = [];

  // Minimización: sin consentimiento no se leen las tenencias.
  if (consentAt) {
    const { data: holdings, error: holdingsError } = await supabase
      .from("user_holdings")
      .select("symbol, name, quantity, avg_cost, currency, market")
      .eq("user_id", profile.id)
      .order("weight", { ascending: false });
    if (holdingsError) {
      console.warn("[reclu] user_holdings:", holdingsError.message);
    }

    const rows = (holdings ?? []) as HoldingRow[];
    const symbols = [
      ...new Set(
        rows.flatMap((row) => {
          const symbol = String(row.symbol).toUpperCase();
          const candidate = priceSymbolFor(
            symbol,
            toMarket(row.market),
            toCurrency(row.currency),
          );
          return candidate === symbol ? [symbol] : [candidate, symbol];
        }),
      ),
    ];
    const prices = await loadLatestPrices(supabase, symbols);

    positions = rows.map((row) => {
      const symbol = String(row.symbol).toUpperCase();
      const market = toMarket(row.market);
      const currency = toCurrency(row.currency);
      const price =
        prices.get(priceSymbolFor(symbol, market, currency)) ??
        prices.get(symbol) ??
        null;
      return {
        symbol,
        name: row.name ?? "",
        quantity: toNumber(row.quantity),
        avgCost: toNumber(row.avg_cost),
        currency,
        market,
        // No se convierte moneda: el cierre se muestra en la moneda de la
        // posición. Se ignoran las posiciones sin cierre en `prices`.
        price: price?.close ?? null,
        priceDate: price?.date ?? null,
      };
    });
  }

  const aiModel = (process.env.OPENROUTER_MODEL ?? "").trim();

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <div>
        <h1 className="text-[28px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[32px]">
          Mi portafolio
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-500">
          Tus posiciones valorizadas con el cierre más reciente. Solo tú las ves
          y puedes borrarlas cuando quieras.
        </p>
      </div>

      {consentAt ? (
        <PortfolioEditor
          initialPositions={positions}
          maxPositions={limits.maxPositions}
          canExportCsv={limits.exportCsv}
          planName={planName}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Antes de empezar: consentimiento</CardTitle>
            <CardDescription>
              Para guardar y valorizar tu cartera necesitamos tu consentimiento
              explícito. Sin él no leemos ni tratamos tus posiciones y esta
              página no muestra la tabla editable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PortfolioConsent
              consentAt={storedConsentAt}
              consentVersion={storedConsentVersion}
              model={aiModel}
            />
          </CardContent>
        </Card>
      )}

      {/* Descargo general al pie (Fintec / no asesoría). */}
      <LegalNotice kind="fintec" />
    </div>
  );
}
