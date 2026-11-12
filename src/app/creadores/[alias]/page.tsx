import { withSeo } from "@/lib/seo";
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
import { Avatar } from "@/components/app";

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
    notFound();
  }

  return withSeo(`/creadores/${alias}`, {
    title: `Creador ${alias}`,
    description: `Carteras publicadas por ${alias} en la comunidad de fraccion.si. Contenido de terceros, no asesoría de inversión.`,
  });
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

  const holdingsCount = portfolios.reduce((s, p) => s + p.holdings.length, 0);
  const lastDate = portfolios[0] ? formatDate(portfolios[0].createdAt) : null;
  const hasBadges = Boolean(profile?.declaraNoAsesoria || profile?.conflictoInteres);

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1 bg-white dark:bg-ink-950">
        <div className="container-page pb-24 pt-8 md:pt-12">
          <Link
            href="/creadores"
            aria-label="Volver a creadores"
            className="inline-flex h-10 items-center gap-2 text-[13px] font-medium text-ink-600 transition-colors hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
          >
            <span aria-hidden>←</span>
            Creadores
          </Link>

          {!profile && loadError ? (
            <section className="mt-6 border border-ink-900 px-5 py-6 dark:border-white/40 sm:px-7 sm:py-8">
              <p className="label-line">Creador</p>
              <h1 className="mt-2 text-[26px] font-medium leading-tight tracking-[-0.03em] text-ink-900 dark:text-white sm:text-[32px]">
                Perfil no disponible
              </h1>
              <p role="alert" className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
                {loadError}
              </p>
            </section>
          ) : null}

          {profile ? (
            <>
              <header className="mt-6 border-b border-ink-300 pb-8 dark:border-white/12">
                <div className="flex items-start gap-4 sm:gap-6">
                  <Avatar
                    name={profile.alias}
                    className="size-14 rounded-none border border-ink-300 bg-ink-900 text-[18px] text-white dark:border-white/20 dark:bg-white dark:text-ink-950 sm:size-16"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="label-line">Creador</p>
                    <h1 className="mt-1 break-words font-mono text-[26px] font-medium leading-[1.1] tracking-[-0.02em] text-ink-900 dark:text-white sm:text-[34px]">
                      {profile.alias}
                    </h1>
                    <p className="mt-2 text-[12px] leading-tight text-ink-600 dark:text-ink-400">
                      <span aria-hidden>✓</span> Verificado por moderación
                    </p>
                  </div>
                </div>

                {profile.bio ? (
                  <p className="mt-5 max-w-2xl break-words text-[15px] leading-relaxed text-ink-700 dark:text-ink-300">
                    {profile.bio}
                  </p>
                ) : null}

                {hasBadges ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {profile.declaraNoAsesoria ? (
                      <span className="border border-ink-300 px-2.5 py-1 text-[12px] font-medium leading-none text-ink-700 dark:border-white/20 dark:text-ink-300">
                        Declara que no entrega asesoría
                      </span>
                    ) : null}
                    {profile.conflictoInteres ? (
                      <span className="border border-ink-900 px-2.5 py-1 text-[12px] font-medium leading-none text-ink-900 dark:border-white/40 dark:text-white">
                        Conflicto de interés declarado
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {/* Con error de carga no hay cifras: se muestran solo si son fiables. */}
                {!loadError ? (
                  <>
                    <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-ink-300 pt-6 dark:border-white/12">
                      <div>
                        <dt className="label-line">Carteras publicadas</dt>
                        <dd className="num mt-2 text-[24px] leading-none text-ink-900 dark:text-white">{portfolios.length}</dd>
                      </div>
                      <div>
                        <dt className="label-line">Posiciones declaradas</dt>
                        <dd className="num mt-2 text-[24px] leading-none text-ink-900 dark:text-white">{holdingsCount}</dd>
                      </div>
                    </dl>
                    {lastDate ? (
                      <p className="mt-4 text-[13px] text-ink-500 dark:text-ink-400">
                        Última publicación:{" "}
                        <time dateTime={portfolios[0]?.createdAt} className="num text-ink-900 dark:text-white">
                          {lastDate}
                        </time>
                      </p>
                    ) : null}
                  </>
                ) : null}
              </header>

              {profile.conflictoInteres ? (
                <div className="mt-6 border border-ink-900 px-4 py-3 dark:border-white/40 sm:px-5">
                  <p className="break-words text-[13px] leading-relaxed text-ink-600 dark:text-ink-400">
                    <strong className="font-medium text-ink-900 dark:text-white">Conflicto de interés declarado.</strong>{" "}
                    {profile.conflictoInteres}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 border border-ink-300 px-4 py-3 dark:border-white/12 sm:px-5">
                <p className="text-[13px] leading-relaxed text-ink-600 dark:text-ink-400">
                  <strong className="font-medium text-ink-900 dark:text-white">Contenido de terceros, no asesoría.</strong>{" "}
                  Cada creador publica su cartera y refleja su propia opinión, no una recomendación de
                  fraccion.si. No ejecutamos órdenes ni entregamos asesoría de inversión personalizada.
                  Los pesos son los que declara el creador y no los verificamos posición por posición.
                </p>
              </div>

              {loadError ? (
                <p role="alert" className="mt-6 border border-ink-900 px-4 py-3 text-[14px] text-ink-900 dark:border-white/40 dark:text-white">
                  {loadError}
                </p>
              ) : null}

              {!loadError ? (
                <section className="mt-12" aria-labelledby="carteras">
                  <h2 id="carteras" className="border-b border-ink-300 pb-3 text-[15px] font-medium text-ink-900 dark:border-white/12 dark:text-white">
                    Carteras publicadas
                  </h2>

                  {portfolios.length === 0 ? (
                    <div className="mt-8 border border-ink-300 px-6 py-14 text-center dark:border-white/12">
                      <p className="text-[20px] font-medium tracking-[-0.03em] text-ink-900 dark:text-white">Sin carteras aprobadas</p>
                      <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
                        Este perfil todavía no tiene carteras aprobadas por moderación.
                      </p>
                    </div>
                  ) : (
                    <ol className="divide-y divide-ink-300 dark:divide-white/12">
                      {portfolios.map((portfolio) => {
                        const date = formatDate(portfolio.createdAt);
                        const total = totalWeight(portfolio.holdings);
                        const sorted = [...portfolio.holdings].sort((a, b) => b.weight - a.weight);
                        const max = Math.max(1, ...sorted.map((h) => h.weight));
                        return (
                          <li key={portfolio.id} className="py-8">
                            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                              <h3 className="min-w-0 break-words text-[18px] font-medium leading-snug tracking-[-0.02em] text-ink-900 dark:text-white sm:text-[20px]">
                                {portfolio.titulo}
                              </h3>
                              {date ? (
                                <time dateTime={portfolio.createdAt} className="shrink-0 text-[12px] leading-none text-ink-500 dark:text-ink-400">
                                  {date}
                                </time>
                              ) : null}
                            </div>

                            {portfolio.descripcion ? (
                              <p className="mt-3 max-w-3xl break-words text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
                                {portfolio.descripcion}
                              </p>
                            ) : null}

                            {/* Barra de composición: filetes, sin relleno de color. */}
                            <div className="mt-4 flex h-2 overflow-hidden bg-ink-100 dark:bg-white/10" aria-hidden>
                              {sorted.map((h, i) => (
                                <span
                                  key={`${h.symbol}-${i}`}
                                  className="h-full border-r border-white bg-ink-900 last:border-r-0 dark:border-ink-950 dark:bg-white"
                                  style={{ width: `${(h.weight / Math.max(total, 100)) * 100}%`, opacity: 1 - Math.min(i, 8) * 0.1 }}
                                />
                              ))}
                            </div>

                            <ul className="mt-5 grid gap-x-10 gap-y-3 sm:grid-cols-2">
                              {sorted.map((holding, index) => (
                                <li key={`${portfolio.id}-${holding.symbol}-${index}`} className="flex min-w-0 items-center gap-3">
                                  <span aria-hidden className="flex size-9 shrink-0 items-center justify-center border border-ink-300 font-mono text-[11px] font-medium text-ink-900 dark:border-white/20 dark:text-white">
                                    {holding.symbol.slice(0, 4)}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[14px] text-ink-900 dark:text-white">
                                      <span className="font-mono font-medium">{holding.symbol}</span>
                                      {holding.name ? <span className="ml-2 text-ink-500 dark:text-ink-400">{holding.name}</span> : null}
                                    </p>
                                    <span aria-hidden className="mt-1.5 block h-1 overflow-hidden bg-ink-100 dark:bg-white/10">
                                      <span className="block h-full bg-ink-900 dark:bg-white" style={{ width: `${(holding.weight / max) * 100}%` }} />
                                    </span>
                                  </div>
                                  <span className="num w-16 shrink-0 text-right text-[14px] text-ink-900 dark:text-white">
                                    {formatWeight(holding.weight)}
                                  </span>
                                </li>
                              ))}
                            </ul>

                            <p className="mt-5 border-t border-ink-300 pt-3 text-right text-[12px] text-ink-500 dark:border-white/12 dark:text-ink-400">
                              Total declarado: <span className="num text-ink-900 dark:text-white">{formatWeight(total)}</span>
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              ) : null}
            </>
          ) : null}

          <div className="mt-16 max-w-3xl">
            <LegalNotice kind="fintec" />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
