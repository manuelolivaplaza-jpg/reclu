"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * d54/D10: búsqueda y filtros de Explorar.
 *
 * Buscador con filete de 1px y radio 0 (siempre visible: sin estados
 * escondidos), pills de categoría con borde de 1px y activo invertido
 * (negro sobre blanco, blanco sobre negro en oscuro), cero sombras. El orden
 * es el real del catálogo —más seguidos— y se escribe, no se simula un
 * selector que el servidor todavía no puede honrar. Solo strings como props.
 */
export function ExploreToolbar({
  categories,
  activeCategory,
  basePath = "/explore",
}: {
  categories: { value: string; label: string }[];
  activeCategory: string;
  basePath?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const simbolo = sp.get("simbolo") ?? "";
  const hasSearch = Boolean(q.trim() || simbolo.trim());

  function push(mut: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(sp.toString());
    mut(p);
    const s = p.toString();
    router.push(s ? `${basePath}?${s}` : basePath);
  }

  function onSearch(fd: FormData) {
    const raw = String(fd.get("q") ?? "").trim();
    // Un término corto en mayúsculas o con $ se trata como símbolo.
    const isSymbol = /^\$?[A-Z0-9.]{1,6}$/.test(raw);
    push((p) => {
      p.delete("q");
      p.delete("simbolo");
      if (raw && isSymbol) p.set("simbolo", raw.replace(/^\$/, "").toUpperCase());
      else if (raw) p.set("q", raw);
    });
  }

  const pills = [{ value: "all", label: "Todos" }, ...categories];

  return (
    <div className="flex flex-col gap-3">
      <form action={onSearch} role="search" className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500 dark:text-white/45"
          />
          <label htmlFor="explore-q" className="sr-only">
            Buscar portafolios por nombre, gestor o símbolo
          </label>
          <input
            id="explore-q"
            name="q"
            type="text"
            enterKeyHint="search"
            defaultValue={simbolo || q}
            placeholder="Nombre, gestor o símbolo (ej. NVDA)"
            className="h-11 w-full rounded-none border border-ink-300 bg-white pl-9 pr-10 text-[15px] text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-none dark:border-white/15 dark:bg-ink-950 dark:text-white dark:placeholder:text-white/40 dark:focus:border-white"
          />
          {hasSearch ? (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => push((p) => (p.delete("q"), p.delete("simbolo")))}
              className="absolute right-0.5 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-none text-ink-500 transition-colors hover:text-ink-900 dark:text-white/50 dark:hover:text-white"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
        <button
          type="submit"
          aria-label="Buscar portafolios"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink-900 px-4 text-[14px] font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100"
        >
          <Search aria-hidden="true" className="size-4 sm:hidden" />
          <span className="hidden sm:inline">Buscar</span>
        </button>
      </form>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div
          role="group"
          aria-label="Filtrar por categoría"
          className="no-scrollbar -mx-4 flex snap-x items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {pills.map((pill) => {
            const active = activeCategory === pill.value;
            return (
              <button
                key={pill.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  push((p) => {
                    if (pill.value === "all") p.delete("categoria");
                    else p.set("categoria", pill.value);
                  })
                }
                className={cn(
                  "h-9 shrink-0 snap-start whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-colors",
                  active
                    ? "border-ink-900 bg-ink-900 font-medium text-white dark:border-white dark:bg-white dark:text-ink-900"
                    : "border-ink-300 text-ink-600 hover:border-ink-900 hover:text-ink-900 dark:border-white/15 dark:text-white/70 dark:hover:border-white dark:hover:text-white",
                )}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
        <p className="label-line shrink-0">Orden · más seguidos</p>
      </div>
    </div>
  );
}
