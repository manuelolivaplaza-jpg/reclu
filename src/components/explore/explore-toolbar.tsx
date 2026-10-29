"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * d54: búsqueda y filtros discretos. Una fila chica de chips con un ícono
 * de lupa que despliega el buscador (nombre o símbolo). Solo strings como
 * props.
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
  const [open, setOpen] = useState(hasSearch);

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
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Buscar portafolios"
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors",
            open || hasSearch ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-400",
          )}
        >
          <Search className="size-3.5" strokeWidth={2} />
        </button>
        <div className="-mr-4 min-w-0 flex-1 overflow-x-auto pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mr-0 sm:pr-0">
          <div role="tablist" aria-label="Categorías" className="flex w-max items-center gap-1.5">
            {pills.map((pill) => {
              const active = activeCategory === pill.value;
              return (
                <button
                  key={pill.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() =>
                    push((p) => {
                      if (pill.value === "all") p.delete("categoria");
                      else p.set("categoria", pill.value);
                    })
                  }
                  className={cn(
                    "h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors",
                    active ? "bg-ink-900 font-medium text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                  )}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {open ? (
        <form action={onSearch} className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
            <input
              name="q"
              autoFocus={!hasSearch}
              defaultValue={simbolo || q}
              placeholder="Nombre, gestor o símbolo (ej. NVDA)"
              className="h-9 w-full rounded-full border border-ink-200 bg-white pl-8 pr-3 text-[14px] text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-none"
            />
          </div>
          {hasSearch ? (
            <button
              type="button"
              onClick={() => push((p) => (p.delete("q"), p.delete("simbolo")))}
              className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] text-ink-600 hover:bg-ink-100"
            >
              <X className="size-3.5" /> Limpiar
            </button>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
