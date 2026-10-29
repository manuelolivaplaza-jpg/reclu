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
 * Cada fila es un link completo al detalle del portafolio.
 */

interface Pill {
  label: string;
  pct: number | null;
  estimated?: boolean;
  /** D29: explicación (p. ej. período alternativo). */
  title?: string;
}

function PortfolioRow({
  slug,
  name,
  manager,
  managerInitials,
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
  const negative = pill !== null && pill.pct !== null && pill.pct < 0;

  return (
    <Link
      href={`/portfolio/${slug}`}
      className="group flex min-w-0 items-center gap-3 py-5 sm:gap-4 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
    >
      <PortfolioAvatar
        portfolio={{ slug, name, category: category ?? "thematic", cover_image: coverImage, portrait_image: portraitImage ?? null }}
        size={64}
        title={
          portraitImage && !slugImage(slug)
            ? isLogoImage(portraitImage)
              ? "Logo: marca de su titular, uso referencial"
              : "Foto: retrato oficial, dominio público"
            : undefined
        }
      />

      <div className="min-w-0 flex-1">
        {pill ? (
          <span
            title={pill.title}
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
              negative ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700",
            )}
          >
            {pill.label}
          </span>
        ) : null}
        {pill?.estimated ? (
          <span
            title="Incluye un tramo estimado con las posiciones actuales"
            className="ml-1.5 inline-flex items-center rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500"
          >
            estimado
          </span>
        ) : null}

        <h3 className="mt-1.5 truncate text-[19px] font-bold tracking-tight text-neutral-950">
          {name}
        </h3>

        {manager ? (
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-neutral-500">
            <span
              aria-hidden="true"
              className="flex size-4 items-center justify-center rounded-full bg-neutral-100 text-[9px] font-semibold text-neutral-600"
            >
              {managerInitials}
            </span>
            <span className="truncate">{manager}</span>
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="whitespace-nowrap text-[13px] tabular-nums text-neutral-500">
          {followersLabel}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="hidden size-4 text-neutral-400 transition-transform sm:block duration-200 motion-reduce:transition-none group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
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

  return (
    <section className="bg-white py-24 font-sans md:py-32">
      <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
            Portafolios que puedes seguir hoy
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-500">
            Rendimiento calculado sobre la serie real de cada cartera y las más
            seguidas de la comunidad. Sin cifras inventadas: si un período no
            tiene datos, no aparece.
          </p>
        </div>

        <div className="min-w-0 lg:shrink-0">
          <p className="mb-2 text-[13px] text-neutral-500">Período del retorno</p>
          <div
            role="tablist"
            aria-label="Período de rendimiento"
            className="flex max-w-full flex-wrap gap-1.5 py-1"
          >
            {data.periods.map((period) => {
              const active = period.id === periodId;
              return (
                <button
                  key={period.id}
                  id={`tab-${period.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="panel-ranking"
                  aria-disabled={!period.hasData}
                  disabled={!period.hasData}
                  title={
                    period.hasData
                      ? `Rendimiento de los últimos ${period.label}`
                      : `Sin datos para ${period.label}`
                  }
                  onClick={() => setPeriodId(period.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950",
                    active
                      ? "bg-neutral-950 text-white"
                      : period.hasData
                        ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                        : "cursor-not-allowed bg-neutral-50 text-neutral-400",
                  )}
                >
                  {period.label}
                  {!period.hasData ? <span className="sr-only"> (sin datos)</span> : null}
                </button>
              );
            })}
          </div>
  
        </div>
        </div>

        <div className="mt-12 grid grid-cols-1 items-start gap-14 md:grid-cols-2 md:gap-10">
          {/* Mejor rendimiento */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <h3 className="text-xl font-semibold tracking-tight text-neutral-950">
                Mejor rendimiento
              </h3>
              <p className="text-[13px] text-neutral-500">Retorno del período</p>
            </div>

            <div
              id="panel-ranking"
              role="tabpanel"
              aria-labelledby={`tab-${periodId}`}
              className="mt-6 divide-y divide-neutral-200/70"
            >
              {rows.length === 0 ? (
                <p className="py-6 text-[15px] text-neutral-500">
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
              <h3 className="text-xl font-semibold tracking-tight text-neutral-950">
                Populares
              </h3>
              <p className="text-[13px] text-neutral-500">Más seguidos</p>
            </div>

            <div className="mt-6 divide-y divide-neutral-200/70">
              {popular.length === 0 ? (
                <p className="py-6 text-[15px] text-neutral-500">
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
                            ? { label: `${row.longest.label} · ${row.longest.periodLabel}`, pct: row.longest.pct, estimated: row.longest.estimated, title: `Sin datos para el período elegido; se muestra el más largo disponible (${row.longest.periodLabel})` }
                            : null
                      }
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>

        <p className="mt-12 text-[13px] leading-relaxed text-neutral-500">
          Rentabilidades pasadas no garantizan resultados futuros. Los datos
          provienen de fuentes públicas y tienen el atraso propio de cada
          fuente. Reclu entrega información, no asesoría de inversión.
        </p>

        {data.updatedAt ? (
          <p className="mt-3 text-[13px] text-neutral-500">Actualizado el {formatShortDate(data.updatedAt)}</p>
        ) : null}

        {data.demo ? (
          <p className="mt-4 text-[13px] text-neutral-500">
            <span className="mr-2 inline-block size-1.5 rounded-full bg-neutral-400 align-middle" />
            Datos de ejemplo: sin conexión con la base real.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** "12.400 seguidores" — número real, sin inventar montos. */
function formatFollowers(followers: number): string {
  if (!Number.isFinite(followers)) return "0 seguidores";
  return `${followers.toLocaleString("es-CL")} seguidores`;
}
