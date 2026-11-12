"use client";

import { useMemo, useState } from "react";
import { isLogoImage } from "@/components/portrait-credit";
import { slugImage } from "@/lib/portfolio-avatar";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn, formatShortDate } from "@/lib/utils";
import type {
  RankingsBestRow,
  RankingsPayload,
  RankingsPopularRow,
} from "@/lib/portfolio-rankings";

/**
 * PortfolioRankings — dos columnas en la home: "Mejor rendimiento" (con
 * selector de período) y "Populares".
 *
 * Los datos llegan desde el servidor (`getPortfolioRankings`): este
 * componente solo cambia de período, no vuelve a pedir nada. El muro de pago
 * ya se aplicó en el servidor — acá no hay cifras de portafolios premium.
 *
 * Cada fila es un link completo al detalle del portafolio. El retorno es la
 * única cifra con color (verde/rojo); el resto es tinta y filetes.
 */

interface Pill {
  label: string;
  pct: number | null;
  estimated?: boolean;
  /** D29: explicación (p. ej. período alternativo). */
  title?: string;
  /** Período de la cifra cuando no es el elegido (p. ej. "2A"). */
  note?: string;
}

function PortfolioRow({
  slug,
  name,
  manager,
  coverImage,
  category,
  portraitImage,
  followersLabel,
  pill,
}: {
  slug: string;
  name: string;
  initials: string;
  manager: string | null;
  managerInitials: string | null;
  coverImage: string | null;
  category?: import("@/lib/types").PortfolioCategory;
  portraitImage?: string | null;
  followersLabel: string;
  pill: Pill | null;
}) {
  const pct = pill?.pct ?? null;
  const hasValue = pct !== null;
  const negative = pct !== null && pct < 0;
  const positive = pct !== null && pct > 0;
  const note = [pill?.note ? `período ${pill.note}` : null, pill?.estimated ? "estimado" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/portfolio/${slug}`}
      className="group grid min-h-[68px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3.5 transition-colors hover:bg-ink-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-900 dark:hover:bg-white/[0.04] dark:focus-visible:outline-white sm:gap-4 sm:py-4"
    >
      <PortfolioAvatar
        portfolio={{ slug, name, category: category ?? "thematic", cover_image: coverImage, portrait_image: portraitImage ?? null }}
        size={40}
        title={
          portraitImage && !slugImage(slug)
            ? isLogoImage(portraitImage)
              ? "Logo: marca de su titular, uso referencial"
              : "Foto: retrato oficial, dominio público"
            : undefined
        }
      />

      <div className="min-w-0">
        <h4 className="truncate text-[17px] font-medium leading-tight tracking-[-0.02em] text-ink-900 dark:text-white">
          {name}
        </h4>
        {manager ? (
          <p className="mt-1 truncate text-[13px] leading-tight text-ink-500 dark:text-neutral-400">
            {manager}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="flex flex-col items-end gap-0.5 text-right">
          {hasValue ? (
            <span
              title={pill?.title}
              className={cn(
                "num text-[17px] leading-none sm:text-[18px]",
                positive
                  ? "text-positive"
                  : negative
                    ? "text-negative"
                    : "text-ink-900 dark:text-white",
              )}
            >
              {pill?.label}
            </span>
          ) : (
            <span className="text-[13px] leading-none text-ink-500 dark:text-neutral-400">
              Sin serie
            </span>
          )}
          {note ? (
            <span className="text-[11px] leading-tight text-ink-500 dark:text-neutral-400">
              {note}
            </span>
          ) : null}
          <span className="text-[12px] leading-tight text-ink-500 dark:text-neutral-400">
            {followersLabel}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="hidden size-4 shrink-0 text-ink-400 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 sm:block dark:text-neutral-500"
        />
      </div>
    </Link>
  );
}

export function PortfolioRankings({ data }: { data: RankingsPayload }) {
  const firstWithData = useMemo(
    () =>
      [...data.periods].reverse().find((period) => period.hasData) ??
      data.periods[data.periods.length - 1],
    [data.periods],
  );
  const [periodId, setPeriodId] = useState<string>(firstWithData?.id ?? "2A");

  const rows: RankingsBestRow[] = data.best[periodId] ?? [];
  const popular: RankingsPopularRow[] = data.popular;
  const hasRanking = data.periods.some((period) => (data.best[period.id]?.length ?? 0) > 0);
  const hasAny = hasRanking || popular.length > 0;

  return (
    <section
      aria-labelledby="rankings-title"
      className="border-t border-ink-300 bg-white py-24 dark:border-white/12 dark:bg-ink-950 md:py-32"
    >
      <div className="container-page">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="label-line">Ranking</p>
            <h2
              id="rankings-title"
              className="type-section mt-4 max-w-[16ch] text-ink-900 dark:text-white"
            >
              Portafolios que puedes seguir hoy
            </h2>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-ink-500 dark:text-neutral-400">
              Rendimiento calculado sobre la serie real de cada cartera y las más
              seguidas de la comunidad. Sin cifras inventadas: si un período no
              tiene datos, no aparece.
            </p>
          </div>

          {hasAny ? (
            <div className="min-w-0 lg:shrink-0">
              <p
                id="rankings-period-label"
                className="mb-2 text-[13px] text-ink-500 dark:text-neutral-400"
              >
                Período del retorno
              </p>
              <div
                role="group"
                aria-labelledby="rankings-period-label"
                className="flex max-w-full flex-wrap gap-1.5"
              >
                {data.periods.map((period) => {
                  const active = period.id === periodId;
                  return (
                    <button
                      key={period.id}
                      type="button"
                      aria-pressed={active}
                      disabled={!period.hasData}
                      title={
                        period.hasData
                          ? `Rendimiento de los últimos ${period.label}`
                          : `Sin datos para ${period.label}`
                      }
                      onClick={() => setPeriodId(period.id)}
                      className={cn(
                        "inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:focus-visible:outline-white",
                        active
                          ? "border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900"
                          : period.hasData
                            ? "border-ink-300 text-ink-700 hover:border-ink-900 hover:text-ink-900 dark:border-white/20 dark:text-neutral-300 dark:hover:border-white dark:hover:text-white"
                            : "cursor-not-allowed border-ink-200 text-ink-400 dark:border-white/10 dark:text-neutral-600",
                      )}
                    >
                      {period.label}
                      {!period.hasData ? <span className="sr-only"> (sin datos)</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {hasAny ? (
          <p className="mt-8 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[13px] leading-relaxed text-ink-500 dark:text-neutral-400">
            <span>
              Los portafolios premium del ranking están disponibles con Pro o Elite.
            </span>
            <Link
              href="/planes"
              className="text-ink-900 underline decoration-ink-300 underline-offset-4 transition-colors hover:decoration-ink-900 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:text-white dark:decoration-white/30 dark:hover:decoration-white dark:focus-visible:outline-white"
            >
              Ver planes
            </Link>
          </p>
        ) : null}

        {hasAny ? (
          <div className="mt-12 grid grid-cols-1 items-start gap-14 md:grid-cols-2 md:gap-10">
            {/* Mejor rendimiento */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h3 className="text-xl font-medium tracking-[-0.02em] text-ink-900 dark:text-white">
                  Mejor rendimiento
                </h3>
                <p className="text-[13px] text-ink-500 dark:text-neutral-400">Retorno del período</p>
              </div>

              <div
                id="panel-ranking"
                className="mt-6 divide-y divide-ink-300 border-t border-ink-300 dark:divide-white/12 dark:border-white/12"
              >
                {rows.length === 0 ? (
                  <p className="py-6 text-[15px] leading-relaxed text-ink-500 dark:text-neutral-400">
                    Todavía no hay series de rendimiento para este período.
                  </p>
                ) : (
                  rows.map((row) => (
                    <PortfolioRow
                      key={row.slug}
                      slug={row.slug}
                      name={row.name}
                      initials={row.initials}
                      manager={row.manager}
                      managerInitials={row.managerInitials}
                      coverImage={row.coverImage}
                      category={row.category}
                      portraitImage={row.portraitImage}
                      followersLabel={formatFollowers(row.followers)}
                      pill={{ label: row.returnLabel, pct: row.returnPct, estimated: row.estimated }}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Populares */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h3 className="text-xl font-medium tracking-[-0.02em] text-ink-900 dark:text-white">
                  Populares
                </h3>
                <p className="text-[13px] text-ink-500 dark:text-neutral-400">Más seguidos</p>
              </div>

              <div className="mt-6 divide-y divide-ink-300 border-t border-ink-300 dark:divide-white/12 dark:border-white/12">
                {popular.length === 0 ? (
                  <p className="py-6 text-[15px] leading-relaxed text-ink-500 dark:text-neutral-400">
                    Todavía no hay portafolios publicados.
                  </p>
                ) : (
                  popular.map((row) => {
                    const value = row.returns[periodId];
                    return (
                      <PortfolioRow
                        key={row.slug}
                        slug={row.slug}
                        name={row.name}
                        initials={row.initials}
                        manager={row.manager}
                        managerInitials={row.managerInitials}
                        coverImage={row.coverImage}
                        category={row.category}
                        portraitImage={row.portraitImage}
                        followersLabel={formatFollowers(row.followers)}
                        pill={
                          value && value.pct !== null
                            ? { label: value.label, pct: value.pct, estimated: value.estimated }
                            : row.longest
                              ? {
                                  label: row.longest.label,
                                  pct: row.longest.pct,
                                  estimated: row.longest.estimated,
                                  note: row.longest.periodLabel,
                                  title: `Sin datos para el período elegido; se muestra el más largo disponible (${row.longest.periodLabel})`,
                                }
                              : null
                        }
                      />
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-10 max-w-[52ch] text-[15px] leading-relaxed text-ink-500 dark:text-neutral-400">
            Todavía no hay portafolios publicados. Cuando existan series reales,
            el ranking aparecerá aquí.
          </p>
        )}

        <p className="mt-12 text-[13px] leading-relaxed text-ink-500 dark:text-neutral-400">
          Rentabilidades pasadas no garantizan resultados futuros. Los datos
          provienen de fuentes públicas y tienen el atraso propio de cada
          fuente. Fraccion entrega información, no asesoría de inversión.
        </p>

        {data.updatedAt ? (
          <p className="mt-3 text-[13px] text-ink-500 dark:text-neutral-400">
            Actualizado el {formatShortDate(data.updatedAt)}
          </p>
        ) : null}

        {data.demo ? (
          <p className="mt-4 text-[13px] text-ink-500 dark:text-neutral-400">
            <span className="mr-2 inline-block size-1.5 rounded-full bg-ink-400 align-middle dark:bg-neutral-500" />
            Datos de ejemplo: sin conexión con la base real.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** "12.400 seguidores" — número real, sin inventar montos. */
function formatFollowers(followers: number): string {
  if (!Number.isFinite(followers)) return "Sin dato de seguidores";
  return `${followers.toLocaleString("es-CL")} ${followers === 1 ? "seguidor" : "seguidores"}`;
}
