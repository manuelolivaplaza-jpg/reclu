"use client";

import { ChevronDown, LayoutGrid, Rows3, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SeguimientoCountry = "all" | "US" | "CL";
export type SeguimientoSort = "total" | "day" | "ytd" | "name";
export type SeguimientoView = "rows" | "grid";

export const COUNTRY_OPTIONS: { value: SeguimientoCountry; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "US", label: "EE.UU." },
  { value: "CL", label: "Chile" },
];

export const SORT_OPTIONS: { value: SeguimientoSort; label: string }[] = [
  { value: "total", label: "Mayor retorno" },
  { value: "day", label: "Variación hoy" },
  { value: "ytd", label: "YTD" },
  { value: "name", label: "Nombre A–Z" },
];

/**
 * D80: barra de control de Seguimiento. Solo presentación y eventos: el
 * estado vive en SeguimientoList para que el filtro y el orden sean la única
 * fuente de verdad de lo que se pinta. Filetes de 1px, sin sombras, activo
 * invertido (negro/blanco). Los controles son nativos y accesibles.
 */
export function SeguimientoToolbar({
  query,
  onQueryChange,
  country,
  onCountryChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  visibleCount,
  totalCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  country: SeguimientoCountry;
  onCountryChange: (value: SeguimientoCountry) => void;
  sort: SeguimientoSort;
  onSortChange: (value: SeguimientoSort) => void;
  view: SeguimientoView;
  onViewChange: (value: SeguimientoView) => void;
  visibleCount: number;
  totalCount: number;
}) {
  const filtering = query.trim().length > 0 || country !== "all";
  const countLabel = `${visibleCount} de ${totalCount} ${totalCount === 1 ? "portafolio" : "portafolios"}`;

  return (
    <div className="flex flex-col gap-3 border-b border-ink-200 pb-4">
      <div className="relative min-w-0">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-500"
          strokeWidth={1.75}
        />
        <label htmlFor="seguimiento-q" className="sr-only">
          Buscar en tu seguimiento por nombre o gestor
        </label>
        <input
          id="seguimiento-q"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Buscar por nombre o gestor"
          aria-label="Buscar por nombre o gestor"
          className="h-10 w-full rounded-full border border-ink-200 bg-white pl-10 pr-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query.length > 0 ? (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            onClick={() => onQueryChange("")}
            className="absolute right-0.5 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-500 transition-colors hover:text-ink-900 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-ink-900"
          >
            <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div
          role="group"
          aria-label="Filtrar por país de origen"
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-ink-200 p-0.5"
        >
          {COUNTRY_OPTIONS.map((option) => {
            const active = country === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onCountryChange(option.value)}
                className={cn(
                  "h-9 rounded-full px-3 text-[12px] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900",
                  active
                    ? "bg-ink-900 font-medium text-white"
                    : "font-normal text-ink-600 hover:text-ink-900",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative shrink-0">
            <label htmlFor="seguimiento-sort" className="sr-only">
              Ordenar portafolios
            </label>
            <select
              id="seguimiento-sort"
              value={sort}
              onChange={(event) => onSortChange(event.target.value as SeguimientoSort)}
              aria-label="Ordenar portafolios"
              className="h-9 appearance-none rounded-full border border-ink-200 bg-white pl-3.5 pr-8 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus:border-ink-900 focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500"
              strokeWidth={1.75}
            />
          </div>

          <div
            role="group"
            aria-label="Vista de los portafolios"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-ink-200 p-0.5"
          >
            <button
              type="button"
              aria-pressed={view === "rows"}
              aria-label="Vista de filas"
              onClick={() => onViewChange("rows")}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900",
                view === "rows"
                  ? "bg-ink-900 font-medium text-white"
                  : "font-normal text-ink-600 hover:text-ink-900",
              )}
            >
              <Rows3 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Filas
            </button>
            <button
              type="button"
              aria-pressed={view === "grid"}
              aria-label="Vista de grilla"
              onClick={() => onViewChange("grid")}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900",
                view === "grid"
                  ? "bg-ink-900 font-medium text-white"
                  : "font-normal text-ink-600 hover:text-ink-900",
              )}
            >
              <LayoutGrid aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Grilla
            </button>
          </div>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {countLabel}
      </p>
      {filtering ? (
        <p className="text-[11px] tabular-nums text-ink-500">{countLabel}</p>
      ) : null}
    </div>
  );
}
