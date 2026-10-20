import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalNotice } from "@/components/legal/legal-notice";
import {
  CREATOR_ALIAS_PATTERN,
  communityEnabled,
  creatorPortfolioSchema,
} from "@/lib/community";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Creador",
  description:
    "Perfil y carteras publicadas por un creador de la comunidad de reclu.cl. Contenido informativo de terceros, no asesoría de inversión.",
};

// Lee la bandera COMMUNITY_ENABLED, el alias y Supabase por request.
export const instant = false;

interface CreatorProfile {
  id: string;
  alias: string;
  bio: string;
  verificado: boolean;
  conflictoInteres: string | null;
  declaraNoAsesoria: boolean;
}

interface CreatorHolding {
  symbol: string;
  name: string;
  weight: number;
}

interface CreatorPortfolio {
  id: string;
  titulo: string;
  descripcion: string;
  holdings: CreatorHolding[];
  createdAt: string;
}

/**
 * Normaliza el perfil que llega de Supabase. Solo se publica si está
 * verificado: la política de RLS ya lo exige, pero no dependemos de ella
 * para decidir qué se muestra.
 */
export function normalizeCreatorProfile(value: unknown): CreatorProfile | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.alias !== "string") {
    return null;
  }
  const alias = candidate.alias.trim();
  if (!CREATOR_ALIAS_PATTERN.test(alias)) return null;
  if (candidate.verificado !== true) return null;

  return {
    id: candidate.id,
    alias,
    bio: typeof candidate.bio === "string" ? candidate.bio.trim() : "",
    verificado: true,
    conflictoInteres:
      typeof candidate.conflicto_interes === "string" &&
      candidate.conflicto_interes.trim()
        ? candidate.conflicto_interes.trim()
        : null,
    declaraNoAsesoria: candidate.declara_no_asesoria === true,
  };
}

/**
 * Valida la cartera con el mismo esquema que usa la propuesta del creador.
 * Una fila aprobada con datos corruptos se descarta en vez de mostrar cifras
 * que no podemos sostener.
 */
export function normalizeCreatorPortfolio(
  value: unknown,
): CreatorPortfolio | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;

  const parsed = creatorPortfolioSchema.safeParse({
    titulo: row.titulo,
    descripcion: typeof row.descripcion === "string" ? row.descripcion : "",
    holdings: row.holdings,
  });
  if (!parsed.success) return null;

  return {
    id: row.id,
    titulo: parsed.data.titulo,
    descripcion: parsed.data.descripcion,
    holdings: parsed.data.holdings.map((holding) => ({
      symbol: holding.symbol,
      name: holding.name,
      weight: holding.weight,
    })),
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
  };
}

function formatWeight(weight: number): string {
  return `${new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 2,
  }).format(weight)}%`;
}

function formatDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function totalWeight(holdings: CreatorHolding[]): number {
  return holdings.reduce((sum, holding) => sum + holding.weight, 0);
}

interface CreatorPageProps {
  params: Promise<{ alias: string }>;
}

export async function generateMetadata({
  params,
}: CreatorPageProps): Promise<Metadata> {
  const { alias } = await params;

  if (!communityEnabled() || !CREATOR_ALIAS_PATTERN.test(alias)) {
    return { title: "Creador no encontrado", robots: { index: false } };
  }

  return {
    title: `Creador ${alias}`,
    description: `Carteras publicadas por ${alias} en la comunidad de reclu.cl. Contenido de terceros, no asesoría de inversión.`,
    alternates: { canonical: `/creadores/${alias}` },
  };
}

export default async function CreatorPage({ params }: CreatorPageProps) {
  await connection();
  const { alias } = await params;

  // Sin la bandera, la comunidad entera no existe para el público. Un alias
  // que no cumple el patrón tampoco toca la base.
  if (!communityEnabled() || !CREATOR_ALIAS_PATTERN.test(alias)) {
    notFound();
  }

  const supabase = await createClient();

  let profile: CreatorProfile | null = null;
  let portfolios: CreatorPortfolio[] = [];
  let loadError: string | null = null;

  try {
    const { data, error } = await supabase
      .from("creator_profiles")
      .select(
        "id, alias, bio, verificado, conflicto_interes, declara_no_asesoria, created_at",
      )
      .eq("alias", alias)
      .maybeSingle();

    if (error) {
      loadError =
        "No pudimos cargar este perfil ahora mismo. Vuelve a intentarlo en unos minutos.";
    } else {
      profile = normalizeCreatorProfile(data);
    }

    if (profile) {
      const { data: portfolioRows, error: portfoliosError } = await supabase
        .from("creator_portfolios")
        .select("id, titulo, descripcion, holdings, created_at")
        .eq("creator_id", profile.id)
        .eq("estado", "approved")
        .order("created_at", { ascending: false })
        .limit(100);

      if (portfoliosError) {
        loadError =
          "No pudimos cargar las carteras de este creador. Vuelve a intentarlo en unos minutos.";
      } else {
        portfolios = (portfolioRows ?? [])
          .map((row) => normalizeCreatorPortfolio(row))
          .filter((row): row is CreatorPortfolio => row !== null);
      }
    }
  } catch {
    loadError =
      "No pudimos cargar este perfil ahora mismo. Vuelve a intentarlo en unos minutos.";
  }

  // Un perfil no verificado (o inexistente) no existe para el público.
  if (!profile && !loadError) {
    notFound();
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <div className="container-page py-16 md:py-20">
          <Link
            href="/creadores"
            className="text-xs uppercase tracking-[0.12em] text-ink-500 transition-opacity hover:opacity-60"
          >
            ← Creadores
          </Link>

          {loadError && (
            <>
              <h1 className="type-section mt-8 text-ink-900">
                Perfil no disponible.
              </h1>
              <p
                role="alert"
                className="mt-8 max-w-3xl border border-ink-200 p-4 text-sm text-ink-900"
              >
                {loadError}
              </p>
              <div className="mt-12 max-w-3xl">
                <LegalNotice kind="fintec" />
              </div>
            </>
          )}

          {profile && (
            <>
              <p className="mt-8 text-xs uppercase tracking-[0.12em] text-ink-500">
                Creador
              </p>
              <h1 className="type-section mt-3 break-words text-ink-900">
                {profile.alias}
              </h1>

              {profile.bio && (
                <p className="type-body mt-6 max-w-2xl">{profile.bio}</p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] uppercase tracking-[0.08em] text-ink-500">
                <span>Perfil verificado por moderación</span>
                {profile.declaraNoAsesoria && (
                  <span>Declara que su contenido no es asesoría</span>
                )}
              </div>

              {profile.conflictoInteres && (
                <div className="mt-8 max-w-3xl border border-ink-200 px-4 py-3 text-[12px] leading-relaxed text-ink-500">
                  <strong className="font-medium text-ink-900">
                    Conflicto de interés declarado.
                  </strong>{" "}
                  {profile.conflictoInteres}
                </div>
              )}

              <div className="mt-8 max-w-3xl border border-ink-900 px-4 py-3 text-[12px] leading-relaxed text-ink-900">
                <strong className="font-medium">
                  Contenido de terceros, no asesoría.
                </strong>{" "}
                Las carteras las publica cada creador y reflejan su opinión, no
                una recomendación de reclu.cl. No ejecutamos órdenes ni damos
                asesoría de inversión personalizada. Los pesos son los que
                declara el creador y no los verificamos posición por posición.
              </div>

              {!loadError && portfolios.length === 0 && (
                <p className="mt-12 max-w-2xl text-[15px] text-ink-500">
                  Este perfil todavía no tiene carteras aprobadas.
                </p>
              )}

              {portfolios.length > 0 && (
                <section className="mt-12" aria-labelledby="carteras">
                  <h2
                    id="carteras"
                    className="text-xs uppercase tracking-[0.12em] text-ink-500"
                  >
                    Carteras publicadas
                  </h2>
                  <ul className="mt-4 border-b border-ink-200">
                    {portfolios.map((portfolio) => {
                      const date = formatDate(portfolio.createdAt);
                      const total = totalWeight(portfolio.holdings);
                      return (
                        <li
                          key={portfolio.id}
                          className="border-t border-ink-200 py-8"
                        >
                          <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-baseline md:gap-8">
                            <h3 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
                              {portfolio.titulo}
                            </h3>
                            {date && (
                              <span className="text-[12px] uppercase tracking-[0.08em] text-ink-500">
                                {date}
                              </span>
                            )}
                          </div>

                          {portfolio.descripcion && (
                            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-500">
                              {portfolio.descripcion}
                            </p>
                          )}

                          <div className="mt-6 max-w-2xl">
                            <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-ink-200 pb-2 text-[11px] uppercase tracking-[0.08em] text-ink-500">
                              <span>Posición</span>
                              <span>Peso declarado</span>
                            </div>
                            <ul>
                              {portfolio.holdings.map((holding, index) => (
                                <li
                                  key={`${portfolio.id}-${holding.symbol}-${index}`}
                                  className="grid grid-cols-[1fr_auto] items-baseline gap-4 border-b border-ink-200 py-2"
                                >
                                  <span className="min-w-0 text-[14px] text-ink-900">
                                    <span className="font-mono text-[13px]">
                                      {holding.symbol}
                                    </span>
                                    {holding.name ? (
                                      <span className="ml-2 text-ink-500">
                                        {holding.name}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="num text-[14px] text-ink-900">
                                    {formatWeight(holding.weight)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            <p className="num mt-3 text-right text-[12px] text-ink-500">
                              Total declarado: {formatWeight(total)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <div className="mt-12 max-w-3xl">
                <LegalNotice kind="fintec" />
              </div>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
