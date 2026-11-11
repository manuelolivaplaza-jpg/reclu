import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { aiEnabled } from "@/lib/ai-flags";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries";
import { isMyPortfolioEnabled, isNewsImpactEnabled, isPortfolioImageImportEnabled } from "@/lib/portfolio-flags";
import { getPlan, portfolioLimitsFor } from "@/lib/plans";
import { PortfolioConsent } from "@/components/portfolio-consent";
import { hasCurrentPortfolioConsent } from "@/lib/portfolio-consent";
import { LegalNotice } from "@/components/legal/legal-notice";
import { PortfolioEditor } from "@/components/my-portfolio/portfolio-editor";
import type { EditablePosition } from "@/components/my-portfolio/types";
import { valuatePortfolio } from "@/lib/portfolio-valuation";
import { loadImpactFeed } from "@/lib/news-feed";
import type { ImpactFeedEntry } from "@/lib/impact-feed";
import { ImpactFeed } from "@/components/impact-feed";

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
  weight: number | string | null;
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
      .select("symbol, name, quantity, avg_cost, currency, market, weight")
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
        // El peso guardado precarga el modo porcentaje (F78).
        weight: toNumber(row.weight),
      };
    });
  }

  // Feed "Noticias que te tocan" (F72). Las noticias y los perfiles son de
  // lectura pública; los pesos salen de la valorización ya calculada con el
  // cliente de sesión. Sin consentimiento no hay posiciones ni feed.
  const newsImpactEnabled = isNewsImpactEnabled();
  let feedEntries: ImpactFeedEntry[] = [];
  let feedHasPositions = false;

  if (consentAt && newsImpactEnabled) {
    const valuation = valuatePortfolio(positions);
    const weights = valuation.positions
      .filter(
        (position): position is typeof position & { weightPct: number } =>
          typeof position.weightPct === "number" && position.weightPct > 0,
      )
      .map((position) => ({ symbol: position.symbol, weight: position.weightPct }));

    feedHasPositions = weights.length > 0;
    if (weights.length > 0) {
      feedEntries = await loadImpactFeed(supabase, {
        positions: weights,
        // `limits.plan` ya resuelve la prueba vigente como Pro.
        plan: limits.plan,
        trialEndsAt: profile.trial_ends_at,
        delayHours: limits.newsDelayHours,
      });
    }
  }

  const aiModel = (process.env.OPENROUTER_MODEL ?? "").trim();

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-ink-200 pb-6 sm:pb-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-normal text-ink-500">
              Cartera personal · Plan {planName}
            </p>
            <h1 className="mt-3 text-[34px] font-medium leading-[1.02] tracking-[-0.04em] text-ink-900 sm:text-[44px]">
              Mi portafolio
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-500">
              Tus posiciones valorizadas con el cierre más reciente. Solo tú las ves
              y puedes borrarlas cuando quieras.
            </p>
          </div>
          <nav
            aria-label="Accesos rápidos"
            className="flex flex-wrap items-center gap-x-6 gap-y-2 lg:shrink-0 lg:justify-end lg:pb-1"
          >
            <Link
              href="/compare"
              className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-700 transition-colors hover:text-ink-900"
            >
              Cruzar con portafolios
              <ArrowRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                strokeWidth={1.5}
              />
            </Link>
            <Link
              href="/settings"
              className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-700 transition-colors hover:text-ink-900"
            >
              Configurar alertas
              <ArrowRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                strokeWidth={1.5}
              />
            </Link>
          </nav>
        </div>
      </header>

      {consentAt ? (
        <PortfolioEditor
          initialPositions={positions}
          maxPositions={limits.maxPositions}
          canExportCsv={limits.exportCsv}
          planName={planName}
          imageImportEnabled={isPortfolioImageImportEnabled()}
        />
      ) : (
        <section className="border border-ink-200 bg-white">
          <div className="border-b border-ink-200 p-5 sm:p-7">
            <h2 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-ink-900">
              Antes de empezar: consentimiento
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-500">
              Para guardar y valorizar tu cartera necesitamos tu consentimiento
              explícito. Sin él no leemos ni tratamos tus posiciones y esta
              página no muestra la tabla editable.
            </p>
          </div>
          <div className="p-5 sm:p-7">
            <PortfolioConsent
              consentAt={storedConsentAt}
              consentVersion={storedConsentVersion}
              model={aiModel}
            />
          </div>
        </section>
      )}

      {consentAt && newsImpactEnabled && (
        <ImpactFeed
          entries={feedEntries}
          planName={planName}
          delayHours={limits.newsDelayHours}
          hasPositions={feedHasPositions}
          aiEnabled={aiEnabled()}
        />
      )}

      {/* Descargo general al pie (Fintec / no asesoría). */}
      <LegalNotice kind="fintec" />
    </div>
  );
}
