"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AppLink as Link } from "@/components/app/app-link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, ArrowDown, CornerDownLeft, Search } from "lucide-react";
import { DEMO_PORTFOLIOS } from "@/lib/demo-data";
import { PortfolioAvatar, type AvatarPortfolio } from "@/components/portfolio-avatar";

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
  /** Portafolio para el avatar; ausente en tickers. */
  avatar?: AvatarPortfolio;
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
    avatar: p,
  }));

  const tickers: PaletteItem[] = POPULAR_TICKERS.map((t) => ({
    id: `t:${t.symbol}`,
    label: t.symbol,
    hint: `${t.count} cartera${t.count !== 1 ? "s" : ""}`,
    keywords: ["ticker", "acción"],
    href: `/accion/${encodeURIComponent(t.symbol.toLowerCase())}`,
  }));

  return [...portfolios, ...tickers];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();
  // Portal a <body>: el header sticky (blur + transform) crea su propio
  // containing block y el overlay no lo cubría.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

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
        className="inline-flex size-10 items-center justify-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 text-[14px] text-neutral-500 transition-colors hover:border-neutral-300 hover:bg-white hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950 sm:h-10 sm:w-auto sm:min-w-[200px] sm:justify-start sm:px-4"
        aria-label="Buscar (⌘K)"
        aria-haspopup="dialog"
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="hidden sm:inline">Buscar</span>
        <span className="num ml-auto hidden rounded-full bg-white px-2 py-0.5 text-[11px] text-neutral-400 ring-1 ring-neutral-200 md:inline" aria-hidden>
          ⌘K
        </span>
      </button>

      {/* Modal */}
      {mounted &&
        createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-start justify-center bg-black/20 px-3 pt-3 backdrop-blur-sm sm:px-4 sm:pt-[15vh]"
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
              className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/10 ring-1 ring-black/5 sm:max-h-[70vh]"
              initial={reduced ? undefined : { opacity: 0, scale: 0.97, y: -6 }}
              animate={reduced ? undefined : { opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, scale: 0.97, y: -6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
                <Search className="size-5 shrink-0 text-neutral-400" aria-hidden />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Busca un portafolio, gestor o ticker"
                  className="w-full bg-transparent text-[17px] text-neutral-950 placeholder:text-neutral-400 focus:outline-none"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="command-list"
                  aria-activedescendant={filtered[active] ? `cmd-${filtered[active].id}` : undefined}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500 hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950"
                  aria-label="Cerrar buscador"
                >
                  esc
                </button>
              </div>

              <ul
                id="command-list"
                role="listbox"
                className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2"
              >
                {filtered.length === 0 ? (
                  <li className="px-3 py-8 text-center text-[15px] text-neutral-500">
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
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 " +
                          (i === active ? "bg-neutral-100" : "")
                        }
                      >
                        {item.avatar ? (
                          <span className="shrink-0 overflow-hidden rounded-lg [&>*]:!size-8">
                            <PortfolioAvatar portfolio={item.avatar} size={40} />
                          </span>
                        ) : (
                          <span
                            aria-hidden
                            className="num flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-[10px] font-semibold text-neutral-600"
                          >
                            {item.label.slice(0, 4)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-neutral-950">
                          {item.label}
                        </span>
                        <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[12px] text-neutral-500">
                          {item.hint}
                        </span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>

              <div className="hidden items-center gap-4 border-t border-neutral-100 px-5 py-2.5 text-[12px] text-neutral-400 sm:flex">
                <span className="inline-flex items-center gap-1">
                  <ArrowUp className="size-3" aria-hidden />
                  <ArrowDown className="size-3" aria-hidden />
                  navegar
                </span>
                <span className="inline-flex items-center gap-1">
                  <CornerDownLeft className="size-3" aria-hidden />
                  abrir
                </span>
                <span className="ml-auto">esc cerrar</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
