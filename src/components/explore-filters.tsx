"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import type { PortfolioCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ExploreFiltersProps {
  categories: [PortfolioCategory, { label: string; description: string }][];
  activeCategory: string;
  /** Ruta base de los filtros: "/explore" (pública) o la ruta interna de la app. */
  basePath?: string;
}

const ALL = { value: "all", label: "Todos" };

export function ExploreFilters({
  categories,
  activeCategory,
  basePath = "/explore",
}: ExploreFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setCategory(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("categoria");
    } else {
      params.set("categoria", value);
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  function handleSearch(formData: FormData) {
    const q = String(formData.get("q") ?? "").trim();
    const simbolo = String(formData.get("simbolo") ?? "").trim().toUpperCase();
    const params = new URLSearchParams(searchParams.toString());
    if (q) {
      params.set("q", q);
    } else {
      params.delete("q");
    }
    if (simbolo) {
      params.set("simbolo", simbolo);
    } else {
      params.delete("simbolo");
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  const pills = [ALL, ...categories.map(([value, meta]) => ({ value, label: meta.label }))];
  const hasActiveSearch = Boolean(
    (searchParams.get("q") ?? "").trim() || (searchParams.get("simbolo") ?? "").trim(),
  );

  function clearFilters() {
    router.push(basePath);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Búsqueda arriba: campos redondeados tipo app, foco negro */}
      <form action={handleSearch} className="flex max-w-3xl flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
          <input
            name="q"
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="Buscar por nombre, gestor o descripción..."
            className="h-11 w-full rounded-full border border-ink-200 bg-ink-50 pr-4 pl-9 text-[15px] text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:bg-white focus:outline-none transition-colors"
          />
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
          <input
            name="simbolo"
            aria-label="Buscar por símbolo"
            defaultValue={(searchParams.get("simbolo") ?? "").toUpperCase()}
            placeholder="Buscar por símbolo"
            autoCapitalize="characters"
            className="h-11 w-full rounded-full border border-ink-200 bg-ink-50 pr-9 pl-9 text-[15px] text-ink-900 uppercase placeholder:normal-case placeholder:text-ink-500 focus:border-ink-900 focus:bg-white focus:outline-none transition-colors"
          />
        </div>
        {hasActiveSearch && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-ink-200 px-4 text-[14px] text-ink-900 transition-colors hover:bg-ink-50 sm:w-auto"
            aria-label="Limpiar búsqueda y filtros"
          >
            <X className="size-4" strokeWidth={1.8} />
            Limpiar
          </button>
        )}
      </form>

      {/* Filtros: scroll horizontal fluido en móvil (sin cortar palabras),
          chips con el activo relleno. */}
      <div className="-mx-5 overflow-x-auto no-scrollbar px-5 md:mx-0 md:px-0">
        <div
          className="flex w-max min-w-full items-center gap-2 pb-1"
          role="tablist"
          aria-label="Categorías"
        >
          {pills.map((pill) => (
            <button
              key={pill.value}
              role="tab"
              aria-selected={activeCategory === pill.value}
              onClick={() => setCategory(pill.value)}
              className={cn(
                "h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900",
                activeCategory === pill.value
                  ? "border-ink-900 bg-ink-900 font-medium text-white"
                  : "border-ink-200 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-900",
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
