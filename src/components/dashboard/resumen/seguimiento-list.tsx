"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import { Sparkline } from "@/components/sparkline";
import { FollowButton } from "@/components/follow-button";
import { CATEGORY_META, type Portfolio } from "@/lib/types";
import { cn, formatSignedPct } from "@/lib/utils";
import type { PeriodKey } from "./periods";
import {
  SeguimientoToolbar,
  type SeguimientoCountry,
  type SeguimientoSort,
  type SeguimientoView,
} from "@/components/dashboard/seguimiento-toolbar";

export interface SeguimientoItem {
  portfolio: Portfolio;
  spark: number[];
  changes: Record<PeriodKey, number | null>;
  total: number | null;
  totalLabel: string;
}

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "1D", label: "Día" },
  { key: "1M", label: "Mes" },
  { key: "YTD", label: "YTD" },
];

const COLS = "lg:grid-cols-[minmax(0,1fr)_56px_56px_56px_56px_96px_132px] lg:gap-3";

/** Búsqueda insensible a mayúsculas y tildes ("Pelosi" encuentra "Pelósi"). */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function countryCode(country: Portfolio["country"]): string {
  return country === "US" ? "US" : country === "CL" ? "CL" : "Global";
}

/** "Políticos EE.UU. · US · Nancy Pelosi", sin segmentos vacíos. */
function portfolioMeta(portfolio: Portfolio): string {
  return [CATEGORY_META[portfolio.category].label, countryCode(portfolio.country), portfolio.manager?.trim() ?? ""]
    .filter((part) => part.length > 0)
    .join(" · ");
}

function tone(value: number | null): string {
  if (value === null || value === 0) return "text-ink-700";
  return value > 0 ? "text-positive" : "text-negative";
}

function compareNumbers(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/** Cifra de periodo: verde/rojo solo si hay dato real; si no, "Sin dato". */
function PeriodValue({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-[12px] text-ink-500">Sin dato</span>;
  }
  return <span className={cn("num text-[12px]", tone(value))}>{formatSignedPct(value, 2)}</span>;
}

function Spark({ data, className }: { data: number[]; className: string }) {
  if (data.length < 2) {
    return <span className="text-[11px] text-ink-500">Sin serie</span>;
  }
  return <Sparkline data={data} className={className} stroke="#0a0a0a" strokeWidth={1.5} />;
}

/**
 * D80: cartera seguida. Filas editoriales (por defecto en escritorio) y grilla
 * de bloques con filete de 1px. El filtro, el orden y la vista se resuelven en
 * cliente sobre los datos ya serializados; nunca se inventa una cifra: un
 * null se escribe "Sin dato".
 */
export function SeguimientoList({ items, isPro }: { items: SeguimientoItem[]; isPro: boolean }) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<SeguimientoCountry>("all");
  const [sort, setSort] = useState<SeguimientoSort>("total");
  const [view, setView] = useState<SeguimientoView>("rows");

  const visible = useMemo(() => {
    const term = normalize(query);
    const filtered = items.filter(({ portfolio: p }) => {
      if (country !== "all" && p.country !== country) return false;
      if (!term) return true;
      return normalize(p.name).includes(term) || normalize(p.manager ?? "").includes(term);
    });

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "name": {
          const aName = normalize(a.portfolio.name);
          const bName = normalize(b.portfolio.name);
          return aName < bName ? -1 : aName > bName ? 1 : 0;
        }
        case "day":
          return compareNumbers(a.changes["1D"], b.changes["1D"]);
        case "ytd":
          return compareNumbers(a.changes.YTD, b.changes.YTD);
        case "total":
        default:
          return compareNumbers(a.total, b.total);
      }
    });
  }, [items, query, country, sort]);

  const countryLabel = country === "US" ? "EE.UU." : country === "CL" ? "Chile" : null;
  const trimmedQuery = query.trim();

  function clearFilters() {
    setQuery("");
    setCountry("all");
  }

  if (items.length === 0) return null;

  const toolbar = items.length >= 2;
  const shownView: SeguimientoView = toolbar ? view : "rows";

  return (
    <section aria-label="Portafolios que sigues" className="flex flex-col gap-4">
      {toolbar ? (
        <SeguimientoToolbar
          query={query}
          onQueryChange={setQuery}
          country={country}
          onCountryChange={setCountry}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
          visibleCount={visible.length}
          totalCount={items.length}
        />
      ) : null}

      {visible.length === 0 ? (
        <div className="app-card px-6 py-14 text-center">
          <p className="text-[17px] font-medium tracking-[-0.02em] text-ink-900">Sin coincidencias</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-500">
            {trimmedQuery && countryLabel
              ? `Ningún portafolio de ${countryLabel} coincide con «${trimmedQuery}».`
              : trimmedQuery
                ? `Ningún portafolio se llama ni es gestionado por «${trimmedQuery}».`
                : `No sigues portafolios de ${countryLabel ?? "ese origen"}.`}
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-5 inline-flex h-10 items-center rounded-full bg-ink-900 px-4 text-[13px] font-medium text-white transition-colors hover:bg-black"
          >
            Limpiar filtros
          </button>
        </div>
      ) : shownView === "rows" ? (
        <div>
          <div className={cn("hidden items-center gap-3 pb-2 lg:grid", COLS)} aria-hidden="true">
            <span className="text-[11px] text-ink-500">Portafolio</span>
            <span className="text-right text-[11px] text-ink-500">Serie</span>
            {PERIODS.map((period) => (
              <span key={period.key} className="text-right text-[11px] text-ink-500">
                {period.label}
              </span>
            ))}
            <span className="text-right text-[11px] text-ink-500">Retorno</span>
            <span />
          </div>

          <ul>
            {visible.map(({ portfolio: p, spark, changes, total, totalLabel }) => {
              const meta = portfolioMeta(p);
              const href = `/app/portafolio/${p.slug}`;

              return (
                <li key={p.id} className="border-t border-line transition-colors last:border-b hover:bg-ink-50/60">
                  {/* Escritorio: fila tipográfica ancha. */}
                  <div className={cn("hidden items-center gap-3 py-5 lg:grid", COLS)}>
                    <div className="flex min-w-0 items-center gap-3">
                      <PortfolioAvatar portfolio={p} size={40} />
                      <div className="min-w-0">
                        <Link
                          href={href}
                          className="block truncate text-[15px] font-medium tracking-[-0.01em] text-ink-900 hover:underline hover:underline-offset-4"
                        >
                          {p.name}
                        </Link>
                        <p className="mt-0.5 truncate text-[11.5px] text-ink-500">{meta}</p>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Spark data={spark} className="h-9 w-14" />
                    </div>

                    {PERIODS.map((period) => (
                      <div key={period.key} className="text-right">
                        <span className="sr-only">{period.label}: </span>
                        <PeriodValue value={changes[period.key]} />
                      </div>
                    ))}

                    <div className="min-w-0 text-right">
                      <span className="sr-only">Retorno: </span>
                      {total === null ? (
                        <span className="text-[12px] text-ink-500">Sin dato</span>
                      ) : (
                        <>
                          <p
                            className={cn("num text-[20px] leading-none xl:text-[22px]", tone(total))}
                          >
                            {formatSignedPct(total, 1)}
                          </p>
                          {totalLabel ? (
                            <p className="mt-1 truncate text-[11px] text-ink-500" title={totalLabel}>
                              {totalLabel}
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <FollowButton
                        portfolioId={p.id}
                        initialFollowing
                        initialIsPro={isPro}
                        portfolioPremium={p.premium}
                      />
                      <Link
                        href={href}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-700 transition-colors hover:text-ink-900 hover:underline hover:underline-offset-4"
                      >
                        Ver ficha
                        <ArrowRight aria-hidden="true" className="size-3" strokeWidth={1.5} />
                      </Link>
                    </div>
                  </div>

                  {/* Móvil y tablet: mismo contenido, apilado sin desbordes. */}
                  <div className="flex flex-col gap-3 py-4 lg:hidden">
                    <div className="flex items-start gap-3">
                      <PortfolioAvatar portfolio={p} size={40} />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={href}
                          className="block truncate text-[15px] font-medium tracking-[-0.01em] text-ink-900 hover:underline hover:underline-offset-4"
                        >
                          {p.name}
                        </Link>
                        <p className="mt-0.5 truncate text-[11.5px] text-ink-500">{meta}</p>
                      </div>
                      <div className="max-w-[128px] shrink-0 text-right">
                        <span className="sr-only">Retorno: </span>
                        {total === null ? (
                          <span className="text-[12px] text-ink-500">Sin dato</span>
                        ) : (
                          <>
                            <p className={cn("num text-[20px] leading-none", tone(total))}>
                              {formatSignedPct(total, 1)}
                            </p>
                            {totalLabel ? (
                              <p className="mt-1 truncate text-[11px] text-ink-500" title={totalLabel}>
                                {totalLabel}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>

                    <Spark data={spark} className="h-8 w-full" />

                    <dl className="grid grid-cols-3 gap-3">
                      {PERIODS.map((period) => (
                        <div key={period.key} className="min-w-0">
                          <dt className="text-[11px] text-ink-500">{period.label}</dt>
                          <dd className="mt-1">
                            <PeriodValue value={changes[period.key]} />
                          </dd>
                        </div>
                      ))}
                    </dl>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                      <Link
                        href={href}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-700 transition-colors hover:text-ink-900 hover:underline hover:underline-offset-4"
                      >
                        Ver ficha
                        <ArrowRight aria-hidden="true" className="size-3" strokeWidth={1.5} />
                      </Link>
                      <FollowButton
                        portfolioId={p.id}
                        initialFollowing
                        initialIsPro={isPro}
                        portfolioPremium={p.premium}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ portfolio: p, spark, changes, total, totalLabel }) => {
            const meta = portfolioMeta(p);
            const href = `/app/portafolio/${p.slug}`;

            return (
              <li key={p.id} className="app-card flex flex-col p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <PortfolioAvatar portfolio={p} size={40} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={href}
                      className="block truncate text-[15px] font-medium tracking-[-0.01em] text-ink-900 hover:underline hover:underline-offset-4"
                    >
                      {p.name}
                    </Link>
                    <p className="mt-0.5 truncate text-[11.5px] text-ink-500">{meta}</p>
                  </div>
                  <div className="max-w-[112px] shrink-0 text-right">
                    <span className="sr-only">Retorno: </span>
                    {total === null ? (
                      <span className="text-[12px] text-ink-500">Sin dato</span>
                    ) : (
                      <>
                        <p className={cn("num text-[22px] leading-none", tone(total))}>{formatSignedPct(total, 1)}</p>
                        {totalLabel ? (
                          <p className="mt-1 truncate text-[11px] text-ink-500" title={totalLabel}>
                            {totalLabel}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <Spark data={spark} className="h-10 w-full" />
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
                  {PERIODS.map((period) => (
                    <div key={period.key}>
                      <dt className="text-[11px] text-ink-500">{period.label}</dt>
                      <dd className="mt-1">
                        <PeriodValue value={changes[period.key]} />
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-700 transition-colors hover:text-ink-900 hover:underline hover:underline-offset-4"
                  >
                    Ver ficha
                    <ArrowRight aria-hidden="true" className="size-3" strokeWidth={1.5} />
                  </Link>
                  <FollowButton
                    portfolioId={p.id}
                    initialFollowing
                    initialIsPro={isPro}
                    portfolioPremium={p.premium}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
