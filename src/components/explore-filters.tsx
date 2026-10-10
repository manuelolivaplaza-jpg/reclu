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
    const params = new URLSearchParams(searchParams.toString());
    if (q) {
      params.set("q", q);
    } else {
      params.delete("q");
    }
    router.push(`/explore?${params.toString()}`);
  }

  const pills = [ALL, ...categories.map(([value, meta]) => ({ value, label: meta.label }))];

  return (
    <div className="flex flex-col gap-5">
      {/* Search */}
      <form action={handleSearch} className="relative max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
        <input
          name="q"
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="Buscar por nombre, gestor o descripción..."
          className="h-11 w-full rounded-lg border border-ink-300 bg-white pr-4 pl-9 text-sm shadow-subtle placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
      </form>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Categorías">
        {pills.map((pill) => (
          <button
            key={pill.value}
            role="tab"
            aria-selected={activeCategory === pill.value}
            onClick={() => setCategory(pill.value)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
              activeCategory === pill.value
                ? "border-brand-600 bg-brand-600 text-white shadow-subtle"
                : "border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:bg-ink-50",
            )}
          >
            {pill.label}
          </button>
        ))}
      </div>
    </div>
  );
}
