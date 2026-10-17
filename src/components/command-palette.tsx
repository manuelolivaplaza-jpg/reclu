"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, ArrowDown, CornerDownLeft } from "lucide-react";
import { DEMO_PORTFOLIOS } from "@/lib/demo-data";

/**
 * CommandPalette — buscador rápido tipo terminal (⌘K / Ctrl+K).
 * Filtra en vivo entre los portafolios principales, sus gestores
 * (Pelosi, Buffett, Ackman, Druckenmiller, Burry, Renta 4, BTG…) y
 * tickers populares. Navegación por teclado: ↑/↓, Enter, Esc.
 *
 * El índice usa el catálogo de demo (los slugs coinciden con los seeds
 * de Supabase), así que funciona igual en modo demo y en producción.
 */

interface PaletteItem {
  id: string;
  /** Etiqueta principal que se muestra y contra la que se filtra. */
  label: string;
  /** Texto secundario (categoría, tipo). */
  hint: string;
  /** Términos adicionales para el match (gestor, tags). */
  keywords: string[];
  href: string;
}

const POPULAR_TICKERS = [
  { symbol: "NVDA", count: 8 },
  { symbol: "AAPL", count: 7 },
  { symbol: "MSFT", count: 9 },
  { symbol: "GOOGL", count: 5 },
  { symbol: "SQM-B", count: 3 },
  { symbol: "COPEC", count: 2 },
  { symbol: "BSANTANDER", count: 2 },
  { symbol: "BABA", count: 1 },
  { symbol: "GE", count: 1 },
];

const CATEGORY_LABEL: Record<string, string> = {
  political_us: "Políticos EE.UU.",
  thematic: "Temáticos / IA",
  broker_cl: "Corredoras Chile",
  public_disclosure: "Declaraciones públicas",
  hedge_fund: "Hedge Funds",
  model: "Modelo reclu",
};

/** Portafolios destacados que encabezan el estado inicial. */
const PRIORITY_SLUGS = [
  "pelosi-tracker",
  "berkshire-hathaway",
  "pershing-square",
  "duquesne-family-office",
  "scion-asset-management",
  "renta4-moderada",
  "btg-cartera-recomendada",
];

function buildItems(): PaletteItem[] {
  const portfolios: PaletteItem[] = DEMO_PORTFOLIOS.map((p) => ({
    id: `p:${p.slug}`,
    label: p.name,
    hint: CATEGORY_LABEL[p.category] ?? p.category,
    keywords: [p.manager ?? "", ...p.tags],
    href: `/portfolio/${p.slug}`,
  }));

  const tickers: PaletteItem[] = POPULAR_TICKERS.map((t) => ({
    id: `t:${t.symbol}`,
    label: t.symbol,
    hint: `${t.count} cartera${t.count !== 1 ? "s" : ""}`,
    keywords: ["ticker", "acción"],
    href: `/explore?simbolo=${encodeURIComponent(t.symbol)}`,
  }));

  return [...portfolios, ...tickers];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();

  const items = useMemo(() => buildItems(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Sin query: primero los gestores estelares, luego tickers.
      const prioritySet = new Set(PRIORITY_SLUGS);
      const top = items.filter((i) => i.id.startsWith("p:") && prioritySet.has(i.id.slice(2)));
      const rest = items.filter((i) => !prioritySet.has(i.id.slice(2)) || !i.id.startsWith("p:"));
      return [...top, ...rest].slice(0, 12);
    }
    return items
      .filter((item) => {
        const haystack = [item.label, item.hint, ...item.keywords]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 8);
  }, [items, query]);

  // Atajo global ⌘K / Ctrl+K y cierre con Esc.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (!v) {
            setQuery("");
            setActive(0);
          }
          return !v;
        });
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Al abrir: focus y bloqueo de scroll del body.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus tras el mount del input.
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (filtered.length ? (i + 1) % filtered.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[active];
        if (item) {
          window.location.assign(item.href);
          setOpen(false);
        }
      }
    },
    [active, filtered],
  );

  return (
    <>
      {/* Botón disparador — estilo terminal discreto.
          Desktop: "Buscar · ⌘K". Móvil: "Buscar" limpio. */}
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        className="inline-flex h-9 items-center gap-2 border border-ink-200 bg-white px-3 text-[13px] text-ink-500 transition-colors hover:border-ink-900 hover:text-ink-900"
        aria-label="Buscar (⌘K)"
        aria-haspopup="dialog"
      >
        <span>Buscar</span>
        <span className="num hidden border-l border-ink-200 pl-2 text-ink-400 md:inline" aria-hidden>
          ⌘K
        </span>
      </button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-start justify-center bg-ink-900/50 pt-[12vh]"
            initial={reduced ? undefined : { opacity: 0 }}
            animate={reduced ? undefined : { opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Buscar en reclu"
          >
            <motion.div
              className="w-full max-w-xl border border-ink-900 bg-white"
              initial={reduced ? undefined : { opacity: 0, y: -8, scale: 0.99 }}
              animate={reduced ? undefined : { opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? undefined : { opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Input tipo terminal */}
              <div className="flex items-center gap-3 border-b border-ink-200 px-4 py-3.5">
                <span className="num text-[15px] text-ink-400" aria-hidden>
                  &gt;
                </span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Busca un portafolio, gestor o ticker…"
                  className="w-full bg-transparent text-[15px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="command-list"
                  aria-activedescendant={filtered[active] ? `cmd-${filtered[active].id}` : undefined}
                  autoComplete="off"
                  spellCheck={false}
                />
                <kbd className="num border border-ink-200 px-1.5 py-0.5 text-[11px] text-ink-400">
                  esc
                </kbd>
              </div>

              {/* Resultados */}
              <ul
                id="command-list"
                role="listbox"
                className="max-h-[50vh] overflow-y-auto"
              >
                {filtered.length === 0 ? (
                  <li className="px-4 py-6 text-[15px] text-ink-500">
                    Sin resultados para “{query}”.
                  </li>
                ) : (
                  filtered.map((item, i) => (
                    <li
                      key={item.id}
                      id={`cmd-${item.id}`}
                      role="option"
                      aria-selected={i === active}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        onMouseEnter={() => setActive(i)}
                        className={
                          "flex items-baseline justify-between gap-4 border-b border-ink-100 px-4 py-3 " +
                          (i === active ? "bg-ink-50" : "bg-white")
                        }
                      >
                        <span className="min-w-0 truncate text-[15px] text-ink-900">
                          {item.label}
                        </span>
                        <span className="shrink-0 text-[13px] text-ink-500">{item.hint}</span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>

              {/* Pie de teclado */}
              <div className="flex items-center gap-4 border-t border-ink-200 px-4 py-2.5 text-[12px] text-ink-400">
                <span className="inline-flex items-center gap-1">
                  <ArrowUp className="size-3" aria-hidden />
                  <ArrowDown className="size-3" aria-hidden />
                  navegar
                </span>
                <span className="inline-flex items-center gap-1">
                  <CornerDownLeft className="size-3" aria-hidden />
                  abrir
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
