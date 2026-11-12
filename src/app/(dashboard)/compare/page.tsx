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
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";

export const metadata = { title: "Comparar", robots: { index: false } };
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

  // Solo cuenta como comparable un portafolio con composición visible para el rol.
  const hasCatalog = compare.portfolios.some((portfolio) => portfolio.holdingsCount > 0);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Solapamiento de cartera"
        title="Comparar"
        subtitle="Cruza tu cartera con los portafolios de Fraccion y mira cuánto se parecen."
        className="mb-0 border-b border-app-border pb-5 lg:mb-0"
        actions={
          <nav aria-label="Accesos rápidos" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {myPortfolioEnabled && (
              <Link
                href="/mi-portafolio"
                className="group inline-flex min-h-9 items-center gap-1.5 text-[13px] font-medium text-ink-700 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
              >
                Mi portafolio
                <ArrowRight
                  aria-hidden="true"
                  className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                  strokeWidth={1.5}
                />
              </Link>
            )}
            <Link
              href="/app/explorar"
              className="group inline-flex min-h-9 items-center gap-1.5 text-[13px] font-medium text-ink-700 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
            >
              Explorar portafolios
              <ArrowRight
                aria-hidden="true"
                className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                strokeWidth={1.5}
              />
            </Link>
          </nav>
        }
      />

      {profile && !hasConsent && (
        <PortfolioConsent
          consentAt={consent?.consent_at ?? null}
          consentVersion={consent?.consent_version ?? null}
          model={aiModel}
        />
      )}

      <section aria-labelledby="comparar-cartera" className="app-panel min-w-0 p-5 sm:p-6">
        <div className="mb-5 border-b border-app-border pb-4">
          <p className="label-line">Paso 1</p>
          <h2
            id="comparar-cartera"
            className="mt-1.5 text-[18px] font-medium leading-snug tracking-[-0.02em] text-ink-900 sm:text-[19px]"
          >
            Tu cartera y coincidencias
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-500">
            Carga tus posiciones y revisa el solapamiento con cada portafolio del catálogo. Tu
            cartera es privada y no se publica.
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

      {hasCatalog ? (
        <section aria-labelledby="comparar-alineacion" className="app-panel min-w-0 p-5 sm:p-6">
          <div className="mb-5 border-b border-app-border pb-4">
            <p className="label-line">Paso 2</p>
            <h2
              id="comparar-alineacion"
              className="mt-1.5 text-[18px] font-medium leading-snug tracking-[-0.02em] text-ink-900 sm:text-[19px]"
            >
              Alineación con gestores y fuentes
            </h2>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-500">
              Compara tus pesos normalizados con un portafolio objetivo: similitud, lo que te
              falta y lo que te sobra. Tú decides qué hacer con esa lectura.
            </p>
          </div>
          <AlignmentPanel catalog={compare.portfolios} />
        </section>
      ) : (
        <section aria-label="Alineación con gestores y fuentes">
          <EmptyState
            eyebrow="Paso 2"
            title="Aún no hay portafolios para comparar"
            description="Cuando el catálogo tenga composiciones publicadas podrás cruzar tu cartera con ellas. Mientras tanto, puedes explorar los portafolios disponibles."
            ctaHref="/app/explorar"
            ctaLabel="Elegir portafolios"
          />
        </section>
      )}
    </div>
  );
}
