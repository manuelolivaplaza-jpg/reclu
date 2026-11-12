import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
import {
  isMyPortfolioEnabled,
  isPortfolioImageImportEnabled,
} from "@/lib/portfolio-flags";
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
  // El enlace a Mi portafolio solo se ofrece si la ruta existe (flag).
  const myPortfolioEnabled = isMyPortfolioEnabled();

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
    <div className="flex min-w-0 flex-col gap-6">
      <header className="border-b border-ink-200 pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-normal text-ink-500">
              Solapamiento de cartera
            </p>
            <h1 className="mt-3 text-[32px] font-medium leading-[1.03] tracking-[-0.04em] text-ink-900 sm:text-[40px]">
              Comparar
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-500">
              Cruza tu cartera con los portafolios de Fraccion y mira cuánto se parecen.
            </p>
          </div>
          <nav
            aria-label="Accesos rápidos"
            className="flex flex-wrap items-center gap-x-6 gap-y-2 lg:shrink-0 lg:justify-end lg:pb-1"
          >
            {myPortfolioEnabled && (
              <Link
                href="/mi-portafolio"
                className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-700 transition-colors hover:text-ink-900"
              >
                Mi portafolio
                <ArrowRight
                  className="size-3.5 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={1.5}
                />
              </Link>
            )}
            <Link
              href="/explore"
              className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-700 transition-colors hover:text-ink-900"
            >
              Explorar portafolios
              <ArrowRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                strokeWidth={1.5}
              />
            </Link>
          </nav>
        </div>
      </header>
      {profile && !hasConsent && (
        <PortfolioConsent
          consentAt={consent?.consent_at ?? null}
          consentVersion={consent?.consent_version ?? null}
          model={aiModel}
        />
      )}
      <section className="min-w-0 border border-ink-200 bg-white p-5 sm:p-7">
        <div className="mb-5 border-b border-ink-200 pb-4 sm:mb-6 sm:pb-5">
          <h2 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-ink-900">
            <span className="mr-2 text-[13px] font-normal text-ink-500">1.</span>
            Tu cartera y coincidencias
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-500">
            Carga tus posiciones y revisa el solapamiento con cada portafolio del
            catálogo. Tu cartera es privada y no se publica.
          </p>
        </div>
        <PortfolioManager
          initialHoldings={userHoldings}
          catalog={compare.portfolios}
          pairs={compare.pairs}
          maxPositions={limits.maxPositions}
          planName={planName}
          imageImportEnabled={imageImportEnabled}
        />
      </section>
      <section className="min-w-0 border border-ink-200 bg-white p-5 sm:p-7">
        <div className="mb-5 border-b border-ink-200 pb-4 sm:mb-6 sm:pb-5">
          <h2 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-ink-900">
            <span className="mr-2 text-[13px] font-normal text-ink-500">2.</span>
            Alineación con gestores y fuentes
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-500">
            Compara tus pesos normalizados con un portafolio objetivo: similitud,
            lo que te falta y lo que te sobra. Tú decides qué hacer con esa lectura.
          </p>
        </div>
        <AlignmentPanel catalog={compare.portfolios} />
      </section>
    </div>
  );
}
