"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
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
}

function Cover({
  name,
  initials,
  coverImage,
}: {
  name: string;
  initials: string;
  coverImage: string | null;
}) {
  const [failed, setFailed] = useState(false);

  if (!coverImage || failed) {
    return (
      <span
        aria-hidden="true"
        className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-[15px] font-semibold text-neutral-500"
      >
        {initials}
      </span>
    );
  }

  return (
    <Image
      src={`/covers/${coverImage}`}
      alt={`Portada de ${name}`}
      width={64}
      height={64}
      onError={() => setFailed(true)}
      className="size-16 shrink-0 rounded-2xl object-cover"
    />
  );
}

function PortfolioRow({
  slug,
  name,
  initials,
  manager,
  managerInitials,
  coverImage,
  followersLabel,
  pill,
}: {
  slug: string;
  name: string;
  initials: string;
  manager: string | null;
  managerInitials: string | null;
  coverImage: string | null;
  followersLabel: string;
  pill: Pill | null;
}) {
  const negative = pill !== null && pill.pct !== null && pill.pct < 0;

  return (
    <Link
      href={`/portfolio/${slug}`}
      className="group flex items-center gap-4 py-5 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
    >
      <Cover name={name} initials={initials} coverImage={coverImage} />

      <div className="min-w-0 flex-1">
        {pill ? (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
              negative ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700",
            )}
          >
            {pill.label}
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
          className="size-4 text-neutral-400 transition-transform duration-200 motion-reduce:transition-none group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
        />
      </div>
    </Link>
  );
}

export function PortfolioRankings({ data }: { data: RankingsPayload }) {
  const firstWithData = useMemo(
    () => data.periods.find((period) => period.hasData) ?? data.periods[0],
    [data.periods],
  );
  const [periodId, setPeriodId] = useState<string>(firstWithData?.id ?? "1S");

  const rows: RankingsBestRow[] = data.best[periodId] ?? [];
  const popular: RankingsPopularRow[] = data.popular;

  return (
    <section className="bg-white py-24 font-sans md:py-32">
      <div className="container-page">
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

        <div className="mt-14 grid gap-14 md:grid-cols-2 md:gap-10">
          {/* Mejor rendimiento */}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <h3 className="text-xl font-semibold tracking-tight text-neutral-950">
                Mejor rendimiento
              </h3>
              <p className="text-[13px] text-neutral-500">Retorno del período</p>
            </div>

            <div
              role="tablist"
              aria-label="Período de rendimiento"
              className="mt-6 flex flex-wrap gap-2"
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
                      "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950",
                      active
                        ? "bg-neutral-950 text-white"
                        : period.hasData
                          ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          : "cursor-not-allowed bg-neutral-50 text-neutral-400",
                    )}
                  >
                    {period.label}
                    {!period.hasData ? (
                      <span className="text-[11px] font-normal">Sin datos</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div
              id="panel-ranking"
              role="tabpanel"
              aria-labelledby={`tab-${periodId}`}
              className="mt-4 divide-y divide-neutral-200/70"
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
                    followersLabel={formatFollowers(row.followers)}
                    pill={{ label: row.returnLabel, pct: row.returnPct }}
                  />
                ))
              )}
            </div>
          </div>

          {/* Populares */}
          <div>
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
                      followersLabel={formatFollowers(row.followers)}
                      pill={
                        value && value.pct !== null
                          ? { label: value.label, pct: value.pct }
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
