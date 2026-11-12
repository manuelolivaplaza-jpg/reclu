"use client";

import { useRef } from "react";
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
 *
 * Accesibilidad: label asociado, `enterKeyHint` de búsqueda, limpiar con
 * etiqueta propia (devuelve el foco al input y borra el texto visible), pills
 * con `aria-pressed` y foco de 1px. En móvil la fila de pills scrollea en
 * horizontal con aire vertical suficiente para que el outline no se corte.
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
  const inputRef = useRef<HTMLInputElement>(null);
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

  function clearSearch() {
    if (inputRef.current) inputRef.current.value = "";
    push((p) => {
      p.delete("q");
      p.delete("simbolo");
    });
    inputRef.current?.focus();
  }

  const pills = [{ value: "all", label: "Todos" }, ...categories];

  return (
    <div className="flex flex-col gap-3">
      <form action={onSearch} role="search" aria-label="Buscar portafolios" className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500 dark:text-white/45"
          />
          <label htmlFor="explore-q" className="sr-only">
            Buscar portafolios por nombre, gestor o símbolo
          </label>
          <input
            ref={inputRef}
            id="explore-q"
            name="q"
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            defaultValue={simbolo || q}
            placeholder="Nombre, gestor o símbolo (ej. NVDA)"
            className="h-11 w-full rounded-none border border-ink-300 bg-white pl-9 pr-12 text-[15px] text-ink-900 placeholder:text-ink-500 focus-visible:border-ink-900 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-ink-900 dark:border-white/15 dark:bg-ink-950 dark:text-white dark:placeholder:text-white/45 dark:focus-visible:border-white dark:focus-visible:outline-white"
          />
          {hasSearch ? (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={clearSearch}
              className="absolute right-0.5 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-none text-ink-500 transition-colors hover:text-ink-900 focus-visible:outline-offset-1 dark:text-white/55 dark:hover:text-white"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
        <button
          type="submit"
          aria-label="Buscar portafolios"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink-900 px-4 text-[14px] font-medium text-white transition-colors hover:bg-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100 dark:focus-visible:outline-white"
        >
          <Search aria-hidden="true" className="size-4 sm:hidden" />
          <span className="hidden sm:inline">Buscar</span>
        </button>
      </form>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div
          role="group"
          aria-label="Filtrar por categoría"
          className="no-scrollbar -mx-4 flex min-w-0 snap-x items-center gap-1.5 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0"
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
                  "inline-flex h-10 shrink-0 snap-start items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-colors focus-visible:outline-offset-2",
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
