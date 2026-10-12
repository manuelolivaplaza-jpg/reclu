"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import type { PortfolioCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ExploreFiltersProps {
  categories: [PortfolioCategory, { label: string; description: string }][];
  activeCategory: string;
}

const ALL = { value: "all", label: "Todos" };

export function ExploreFilters({ categories, activeCategory }: ExploreFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setCategory(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("categoria");
    } else {
      params.set("categoria", value);
    }
    router.push(`/explore?${params.toString()}`);
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
    router.push(`/explore?${params.toString()}`);
  }

  const pills = [ALL, ...categories.map(([value, meta]) => ({ value, label: meta.label }))];

  return (
    <div className="flex flex-col gap-6">
      {/* Búsqueda: borde 1px gris, radio 0, focus negro */}
      <form action={handleSearch} className="flex max-w-3xl flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
          <input
            name="q"
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="Buscar por nombre, gestor o descripción..."
            className="h-11 w-full rounded-none border border-ink-200 bg-white pr-4 pl-9 text-[15px] text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-none"
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
            className="h-11 w-full rounded-none border border-ink-200 bg-white pr-4 pl-9 text-[15px] text-ink-900 uppercase placeholder:normal-case placeholder:text-ink-500 focus:border-ink-900 focus:outline-none"
          />
        </div>
      </form>

      {/* Filtros: activo = subrayado 1px negro; inactivo = gris */}
      <div className="flex flex-wrap gap-x-6 gap-y-3" role="tablist" aria-label="Categorías">
        {pills.map((pill) => (
          <button
            key={pill.value}
            role="tab"
            aria-selected={activeCategory === pill.value}
            onClick={() => setCategory(pill.value)}
            className={cn(
              "border-b pb-0.5 text-[14px] transition-opacity",
              activeCategory === pill.value
                ? "border-ink-900 text-ink-900"
                : "border-transparent text-ink-500 hover:opacity-70",
            )}
          >
            {pill.label}
          </button>
        ))}
      </div>
    </div>
  );
}
