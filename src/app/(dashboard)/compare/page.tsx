import { connection } from "next/server";
import {
  getUserHoldings,
  getPortfolios,
  getAllHoldingsAdmin,
  getProfile,
} from "@/lib/queries";
import { canViewPremium, roleFor } from "@/lib/access";
import { getPlan, portfolioLimitsFor } from "@/lib/plans";
import { buildComparePayload, type ComparePortfolioInput } from "@/lib/compare-overlap";
import { PortfolioManager } from "@/components/portfolio-manager";
import { AlignmentPanel } from "@/components/alignment-panel";
import { PortfolioConsent } from "@/components/portfolio-consent";
import { hasCurrentPortfolioConsent } from "@/lib/portfolio-consent";
import { isPortfolioImageImportEnabled } from "@/lib/portfolio-flags";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Comparar" };
// Auth-gated route — never prerendered.
export const instant = false;

export default async function ComparePage() {
  await connection();

  // El muro se aplica ANTES de serializar: premium fuera para no pagados y
  // recorte HOLDING_LIMITS del rol antes de calcular cualquier solape.
  const profile = await getProfile();
  const role = roleFor(profile);
  // F78: el tope de posiciones del plan también aplica al ingreso por modo.
  const limits = portfolioLimitsFor(profile?.plan, profile?.trial_ends_at);
  const planName = getPlan(limits.plan).name;

  const [holdings, catalog] = await Promise.all([
    getUserHoldings(),
    getPortfolios(),
  ]);

  // M1 (F77): guardar la cartera exige consentimiento vigente tambien aqui.
  const supabase = await createClient();
  const consentRow = profile
    ? (
        await supabase
          .from("user_portfolio_settings")
          .select("consent_at, consent_version")
          .eq("user_id", profile.id)
          .maybeSingle()
      ).data
    : null;
  const consent = consentRow as
    | { consent_at: string | null; consent_version: string | null }
    | null;
  const hasConsent = hasCurrentPortfolioConsent(
    consent?.consent_at ?? null,
    consent?.consent_version ?? null,
  );
  const aiModel = (process.env.OPENROUTER_MODEL ?? "").trim();

  // F79: importación desde una captura (flag apagado por defecto).
  // Sin consentimiento vigente la ruta responde 403, así que el botón tampoco
  // se ofrece: el consent card de arriba explica qué falta.
  const imageImportEnabled = isPortfolioImageImportEnabled() && hasConsent;

  const allowedCatalog = catalog.filter(
    (portfolio) => !portfolio.premium || canViewPremium(role),
  );

  // Libro completo solo en el servidor; el cliente recibe el cruce agregado.
  const withHoldings = await Promise.all(
    allowedCatalog.map(async (portfolio): Promise<ComparePortfolioInput> => {
      const list = await getAllHoldingsAdmin(portfolio.id);
      return {
        slug: portfolio.slug,
        name: portfolio.name,
        returnYtd: portfolio.return_ytd,
        premium: portfolio.premium,
        holdings: list.map((h) => ({ symbol: h.symbol, weight: h.weight })),
      };
    }),
  );

  const userHoldings = holdings.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    weight: h.weight,
  }));
  const compare = buildComparePayload({
    role,
    userHoldings,
    portfolios: withHoldings,
  });

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] text-ink-900 sm:text-[32px]">
          Comparar
        </h1>
        <p className="text-[14px] text-ink-500 sm:text-[15px]">
          Cruza tu cartera con los portafolios de Reclu y mira cuánto se parecen.
        </p>
      </header>
      {profile && !hasConsent && (
        <PortfolioConsent
          consentAt={consent?.consent_at ?? null}
          consentVersion={consent?.consent_version ?? null}
          model={aiModel}
        />
      )}
      <section className="min-w-0 rounded-[12px] border border-[#e6e6e6] bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-6">
      <PortfolioManager
        initialHoldings={userHoldings}
        catalog={compare.portfolios}
        pairs={compare.pairs}
        maxPositions={limits.maxPositions}
        planName={planName}
        imageImportEnabled={imageImportEnabled}
      />
      </section>
      <section className="min-w-0 rounded-[12px] border border-[#e6e6e6] bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-6">
        <AlignmentPanel catalog={compare.portfolios} />
      </section>
    </div>
  );
}
