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
 * fuente de verdad de lo que se pinta. Filetes de 1px, radio 0, sin sombras;
 * el segmento activo se invierte en negro. Los controles son nativos y
 * accesibles (label, aria-pressed, foco visible del sistema).
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
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative w-full min-w-0 sm:max-w-xs sm:flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-500"
            strokeWidth={1.5}
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
            className="h-10 w-full border border-line bg-canvas pl-10 pr-10 text-[14px] text-ink-900 transition-colors placeholder:text-ink-500 hover:border-ink-400 focus-visible:border-ink-900 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query.length > 0 ? (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => onQueryChange("")}
              className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center text-ink-500 transition-colors hover:text-ink-900"
            >
              <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filtrar por país de origen"
            className="inline-flex shrink-0 items-center border border-line"
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
                    "h-9 border-l border-line px-3 text-[12px] font-medium transition-colors first:border-l-0",
                    active ? "bg-ink-900 text-white" : "text-ink-600 hover:text-ink-900",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="relative shrink-0">
            <label htmlFor="seguimiento-sort" className="sr-only">
              Ordenar portafolios
            </label>
            <select
              id="seguimiento-sort"
              value={sort}
              onChange={(event) => onSortChange(event.target.value as SeguimientoSort)}
              className="h-9 appearance-none border border-line bg-canvas pl-3 pr-8 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:border-ink-900"
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
              strokeWidth={1.5}
            />
          </div>

          <div
            role="group"
            aria-label="Vista de los portafolios"
            className="inline-flex shrink-0 items-center border border-line"
          >
            <button
              type="button"
              aria-pressed={view === "rows"}
              aria-label="Vista de filas"
              onClick={() => onViewChange("rows")}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 px-3 text-[12px] font-medium transition-colors",
                view === "rows" ? "bg-ink-900 text-white" : "text-ink-600 hover:text-ink-900",
              )}
            >
              <Rows3 aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
              <span className="hidden sm:inline">Filas</span>
            </button>
            <button
              type="button"
              aria-pressed={view === "grid"}
              aria-label="Vista de grilla"
              onClick={() => onViewChange("grid")}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 border-l border-line px-3 text-[12px] font-medium transition-colors",
                view === "grid" ? "bg-ink-900 text-white" : "text-ink-600 hover:text-ink-900",
              )}
            >
              <LayoutGrid aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
              <span className="hidden sm:inline">Grilla</span>
            </button>
          </div>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {countLabel}
      </p>
      {filtering ? (
        <p aria-hidden="true" className="text-[12px] text-ink-500 tabular-nums">
          {countLabel}
        </p>
      ) : null}
    </div>
  );
}
