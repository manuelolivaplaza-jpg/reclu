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
import { Avatar, Chip, StatCard } from "@/components/app";

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

  const holdingsCount = portfolios.reduce((s, p) => s + p.holdings.length, 0);
  const lastDate = portfolios[0] ? formatDate(portfolios[0].createdAt) : null;

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1 bg-app-canvas">
        <div className="mx-auto w-full max-w-[1120px] px-4 pb-20 pt-6 sm:px-6 md:px-10 md:pt-10">
          <Link href="/creadores" className="inline-flex h-8 items-center rounded-full bg-app-card px-3 text-[13px] font-medium text-ink-700 shadow-sm hover:bg-ink-100">
            ← Creadores
          </Link>

          {loadError && (
            <section className="app-card mt-4 p-5 sm:p-7">
              <h1 className="text-app-display font-semibold tracking-tight text-ink-900">Perfil no disponible</h1>
              <p role="alert" className="mt-3 text-app-body text-ink-600">
                {loadError}
              </p>
            </section>
          )}

          {profile && (
            <>
              <section className="app-card mt-4 p-5 sm:p-7">
                <div className="flex items-center gap-4">
                  <Avatar name={profile.alias} className="size-16 rounded-3xl text-[20px]" />
                  <div className="min-w-0">
                    <p className="text-app-caption font-medium text-ink-500">Creador</p>
                    <h1 className="break-words font-mono text-app-display font-semibold tracking-tight text-ink-900">{profile.alias}</h1>
                  </div>
                </div>
                {profile.bio && <p className="mt-4 max-w-2xl text-app-body text-ink-600">{profile.bio}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Chip tone="buy">✓ Verificado por moderación</Chip>
                  {profile.declaraNoAsesoria && <Chip>Declara que no es asesoría</Chip>}
                  {profile.conflictoInteres && <Chip tone="sell">Conflicto de interés</Chip>}
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <StatCard label="Carteras" value={String(portfolios.length)} />
                  <StatCard label="Posiciones" value={String(holdingsCount)} />
                  <StatCard label="Última" value={lastDate} />
                </div>
              </section>

              {profile.conflictoInteres && (
                <div className="mt-4 rounded-2xl border border-negative/30 bg-negative/5 px-4 py-3 text-[13px] leading-relaxed text-ink-700">
                  <strong className="font-semibold text-ink-900">Conflicto de interés declarado.</strong> {profile.conflictoInteres}
                </div>
              )}

              <div className="mt-4 rounded-2xl border border-ink-900/80 bg-app-card px-4 py-3 text-[13px] leading-relaxed text-ink-900">
                <strong className="font-semibold">Contenido de terceros, no asesoría.</strong> Las carteras las publica cada creador y reflejan su
                opinión, no una recomendación de reclu.cl. No ejecutamos órdenes ni damos asesoría de inversión personalizada. Los pesos son los
                que declara el creador y no los verificamos posición por posición.
              </div>

              {!loadError && portfolios.length === 0 && (
                <div className="app-card mt-4 p-8 text-center">
                  <p className="text-app-title font-semibold text-ink-900">Sin carteras aprobadas</p>
                  <p className="mt-1 text-app-caption text-ink-500">Este perfil todavía no tiene carteras aprobadas.</p>
                </div>
              )}

              {portfolios.length > 0 && (
                <section className="mt-6" aria-labelledby="carteras">
                  <h2 id="carteras" className="mb-3 text-app-title font-semibold text-ink-900">
                    Carteras publicadas
                  </h2>
                  <ul className="grid gap-4 lg:grid-cols-2">
                    {portfolios.map((portfolio) => {
                      const date = formatDate(portfolio.createdAt);
                      const total = totalWeight(portfolio.holdings);
                      const sorted = [...portfolio.holdings].sort((a, b) => b.weight - a.weight);
                      const max = Math.max(1, ...sorted.map((h) => h.weight));
                      return (
                        <li key={portfolio.id} className="app-card p-4 sm:p-5">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-[18px] font-semibold tracking-tight text-ink-900">{portfolio.titulo}</h3>
                            {date && <Chip className="shrink-0">{date}</Chip>}
                          </div>
                          {portfolio.descripcion && (
                            <p className="mt-2 text-[14px] leading-relaxed text-ink-600">{portfolio.descripcion}</p>
                          )}
                          {/* Barra de composición */}
                          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                            {sorted.map((h, i) => (
                              <span
                                key={`${h.symbol}-${i}`}
                                className="h-full border-r border-app-card bg-ink-900 last:border-r-0"
                                style={{ width: `${(h.weight / Math.max(total, 100)) * 100}%`, opacity: 1 - Math.min(i, 8) * 0.1 }}
                              />
                            ))}
                          </div>
                          <ul className="mt-4 flex flex-col gap-2.5">
                            {sorted.map((holding, index) => (
                              <li key={`${portfolio.id}-${holding.symbol}-${index}`} className="flex items-center gap-3">
                                <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink-100 font-mono text-[11px] font-bold text-ink-900">
                                  {holding.symbol.slice(0, 4)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[14px] text-ink-900">
                                    <span className="font-mono font-semibold">{holding.symbol}</span>
                                    {holding.name ? <span className="ml-2 text-ink-500">{holding.name}</span> : null}
                                  </p>
                                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-100">
                                    <span className="block h-full rounded-full bg-ink-900" style={{ width: `${(holding.weight / max) * 100}%` }} />
                                  </span>
                                </div>
                                <span className="w-16 shrink-0 text-right text-[14px] font-semibold tabular-nums text-ink-900">
                                  {formatWeight(holding.weight)}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-4 border-t border-app-border pt-3 text-right text-app-caption tabular-nums text-ink-500">
                            Total declarado: {formatWeight(total)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </>
          )}

          <div className="mt-8 max-w-3xl">
            <LegalNotice kind="fintec" />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
