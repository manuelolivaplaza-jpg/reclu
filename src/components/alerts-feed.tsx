"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BellRing, Search, X } from "lucide-react";
import type { Alert, AlertType, PortfolioCategory } from "@/lib/types";
import { LagBadge } from "@/components/lag-badge";
import { LegalNotice } from "@/components/legal/legal-notice";
import { lagDays, publishedAtFromPayload } from "@/lib/disclosure-lag";
import { cn, timeAgo, formatPctPlain } from "@/lib/utils";

export interface EnrichedAlert extends Omit<Alert, "portfolio"> {
  portfolio: {
    id: string;
    slug: string;
    name: string;
    category: PortfolioCategory;
    manager: string | null;
  };
}

interface AlertsFeedProps {
  alerts: EnrichedAlert[];
  followedIds: string[];
  isPro: boolean;
}

interface ExplainSourceView {
  label: string;
  href: string | null;
}

type ExplainState =
  | { status: "loading"; open: true }
  | { status: "error"; open: true; error: string }
  | {
      status: "done";
      open: boolean;
      text: string;
      sources: ExplainSourceView[];
    };

function parseExplainSources(value: unknown): ExplainSourceView[] {
  if (!Array.isArray(value)) return [];
  const sources: ExplainSourceView[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as { label?: unknown; href?: unknown };
    if (typeof record.label !== "string" || record.label.trim().length === 0) continue;
    sources.push({
      label: record.label.trim().slice(0, 160),
      href:
        typeof record.href === "string" && record.href.startsWith("https://")
          ? record.href
          : null,
    });
  }
  return sources;
}

type ViewTab = "global" | "following" | "leaders";
type TypeFilter =
  | "all"
  | "mention"
  | "new_trade"
  | "sold_trade"
  | "13f_update"
  | "weight_change";

const TYPE_LABEL: Record<AlertType, string> = {
  new_trade: "Compra",
  sold_trade: "Venta",
  weight_change: "Ponderación",
  mention: "Mención",
  threshold: "Umbral",
  dividend: "Dividendo",
  earnings: "Resultados",
  "13f_update": "Filing 13F",
  scraper_error: "Sistema",
};

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "mention", label: "Menciones" },
  { value: "new_trade", label: "Compras" },
  { value: "sold_trade", label: "Ventas" },
  { value: "13f_update", label: "Filing 13F" },
  { value: "weight_change", label: "Ponderación" },
];

export function AlertsFeed({ alerts, followedIds, isPro }: AlertsFeedProps) {
  const [view, setView] = useState<ViewTab>("global");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  const [explanations, setExplanations] = useState<Record<string, ExplainState>>({});

  async function handleExplain(alert: EnrichedAlert) {
    const current = explanations[alert.id];
    if (current?.status === "loading") return;
    if (current?.status === "done") {
      setExplanations((prev) => ({
        ...prev,
        [alert.id]: { ...current, open: !current.open },
      }));
      return;
    }

    setExplanations((prev) => ({
      ...prev,
      [alert.id]: { status: "loading", open: true },
    }));

    try {
      const response = await fetch("/api/explain-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Solo el id (M8): el servidor lee la alerta publicada y explica ese
        // contenido, no el que enviaría el navegador.
        body: JSON.stringify({ alertId: alert.id }),
      });

      const data = (await response.json().catch(() => null)) as
        | { explanation?: unknown; sources?: unknown; error?: unknown }
        | null;

      if (!response.ok) {
        const message =
          typeof data?.error === "string" && data.error.trim().length > 0
            ? data.error
            : "No pudimos generar la explicación.";
        setExplanations((prev) => ({
          ...prev,
          [alert.id]: { status: "error", open: true, error: message },
        }));
        return;
      }

      const explanation =
        typeof data?.explanation === "string" ? data.explanation.trim() : "";
      if (!explanation) {
        setExplanations((prev) => ({
          ...prev,
          [alert.id]: {
            status: "error",
            open: true,
            error: "La IA no entregó una explicación. Intenta de nuevo.",
          },
        }));
        return;
      }

      setExplanations((prev) => ({
        ...prev,
        [alert.id]: {
          status: "done",
          open: true,
          text: explanation,
          sources: parseExplainSources(data?.sources),
        },
      }));
    } catch {
      setExplanations((prev) => ({
        ...prev,
        [alert.id]: {
          status: "error",
          open: true,
          error: "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
        },
      }));
    }
  }

  const followedSet = useMemo(() => new Set(followedIds), [followedIds]);
  const followedCount = followedIds.length;

  const filteredAlerts = useMemo(() => {
    const q = query.trim().toLowerCase();

    return alerts.filter((alert) => {
      if (view === "following") {
        const isFollowed =
          followedSet.has(alert.portfolio_id) ||
          followedSet.has(alert.portfolio.id) ||
          followedSet.has(alert.portfolio.slug);
        if (!isFollowed) return false;
      } else if (view === "leaders") {
        const isLeaderOrMention =
          alert.type === "mention" || alert.portfolio.category === "political_us";
        if (!isLeaderOrMention) return false;
      }

      if (typeFilter !== "all" && alert.type !== typeFilter) {
        return false;
      }

      if (q.length > 0) {
        const symbol =
          typeof alert.payload?.symbol === "string" ? alert.payload.symbol.toLowerCase() : "";
        const ticker =
          typeof alert.payload?.ticker === "string" ? alert.payload.ticker.toLowerCase() : "";
        const title = alert.title.toLowerCase();
        const summary = (alert.summary ?? "").toLowerCase();
        const pfName = alert.portfolio.name.toLowerCase();
        const manager = (alert.portfolio.manager ?? "").toLowerCase();
        const typeLabel = (TYPE_LABEL[alert.type] ?? "").toLowerCase();

        const matches =
          title.includes(q) ||
          summary.includes(q) ||
          pfName.includes(q) ||
          manager.includes(q) ||
          symbol.includes(q) ||
          ticker.includes(q) ||
          typeLabel.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [alerts, view, typeFilter, query, followedSet]);

  const hasActiveFilters = query.trim().length > 0 || typeFilter !== "all";

  function clearFilters() {
    setQuery("");
    setTypeFilter("all");
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Tabs de vista principal */}
      <div className="-mx-5 overflow-x-auto no-scrollbar border-b border-ink-200 px-5 md:mx-0 md:px-0">
        <div
          className="flex w-max min-w-full items-center gap-x-8"
          role="tablist"
          aria-label="Vista de alertas"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "global"}
            onClick={() => setView("global")}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 py-3 text-[14px] transition-colors",
              view === "global"
                ? "border-ink-900 font-medium text-ink-900"
                : "border-transparent text-ink-500 hover:text-ink-900",
            )}
          >
            Feed global
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "following"}
            onClick={() => setView("following")}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 py-3 text-[14px] tabular-nums transition-colors",
              view === "following"
                ? "border-ink-900 font-medium text-ink-900"
                : "border-transparent text-ink-500 hover:text-ink-900",
            )}
          >
            {`Mis portafolios (${followedCount})`}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "leaders"}
            onClick={() => setView("leaders")}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 py-3 text-[14px] transition-colors",
              view === "leaders"
                ? "border-ink-900 font-medium text-ink-900"
                : "border-transparent text-ink-500 hover:text-ink-900",
            )}
          >
            Menciones & Líderes
          </button>
        </div>
      </div>

      {/* 2. Buscador en tiempo real + píldoras de tipo */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-500"
              strokeWidth={1.5}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtra por ticker (NVDA, TSLA, SQM-B), político o fondo…"
              aria-label="Filtra por ticker, político o fondo"
              className="h-11 w-full rounded-none border border-ink-200 bg-white pr-4 pl-10 text-[15px] text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-none"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 border border-ink-200 bg-white px-4 text-[14px] text-ink-900 transition-colors hover:border-ink-900 sm:w-auto"
            >
              <X className="size-4" strokeWidth={1.5} />
              Limpiar
            </button>
          )}
        </div>

        <div className="-mx-5 overflow-x-auto no-scrollbar px-5 md:mx-0 md:px-0">
          <div
            className="flex w-max items-center gap-2"
            role="group"
            aria-label="Filtrar por tipo de alerta"
          >
            {TYPE_FILTERS.map((item) => {
              const active = typeFilter === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTypeFilter(item.value)}
                  className={cn(
                    "shrink-0 border px-3 py-1.5 text-[13px] transition-colors",
                    active
                      ? "border-ink-900 bg-ink-900 font-medium text-white"
                      : "border-ink-200 bg-white text-ink-600 hover:border-ink-900 hover:text-ink-900",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Lista de alertas */}
      {filteredAlerts.length > 0 ? (
        <div className="flex flex-col">
          {filteredAlerts.map((alert) => {
            const isHighlighted = alert.type === "mention" || alert.severity === "high";
            const payload = alert.payload ?? {};
            const rawSymbol =
              typeof alert.payload?.symbol === "string" && alert.payload.symbol.trim().length > 0
                ? alert.payload.symbol.trim().toUpperCase()
                : null;
            const prevWeight =
              typeof alert.payload?.previous_weight === "number"
                ? alert.payload.previous_weight
                : null;
            const newWeight =
              typeof alert.payload?.new_weight === "number" ? alert.payload.new_weight : null;
            const deltaWeight =
              prevWeight !== null && newWeight !== null ? newWeight - prevWeight : null;
            const explain = explanations[alert.id];
            const explainLabel =
              explain?.status === "loading"
                ? "Explicando…"
                : explain?.status === "error"
                  ? "Reintentar"
                  : explain?.status === "done" && explain.open
                    ? "Ocultar"
                    : explain?.status === "done"
                      ? "Ver explicación"
                      : "Explicar";

            return (
              <article key={alert.id} className="border-t border-ink-200 py-6 last:border-b">
                {/* Meta superior */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-500">
                  <span
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-medium",
                      isHighlighted
                        ? "border border-ink-900 text-ink-900"
                        : "border border-ink-200 text-ink-600",
                    )}
                  >
                    {TYPE_LABEL[alert.type] ?? "Alerta"}
                  </span>

                  <Link
                    href={`/portfolio/${alert.portfolio.slug}`}
                    className="font-medium text-ink-900 underline-offset-4 hover:underline"
                  >
                    {alert.portfolio.name}
                  </Link>

                  {alert.portfolio.manager &&
                    alert.portfolio.manager !== alert.portfolio.name && (
                      <span>· {alert.portfolio.manager}</span>
                    )}

                  <span className="tabular-nums">· {timeAgo(alert.created_at)}</span>

                  <LagBadge
                    publishedAt={publishedAtFromPayload(payload)}
                    recordedAt={alert.created_at}
                    lagDays={lagDays(payload)}
                    leadingDot
                  />
                </div>

                {/* Chip de ticker + delta de peso si existe */}
                {rawSymbol && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/accion/${encodeURIComponent(rawSymbol.toLowerCase())}`}
                      className="inline-flex items-center gap-2 border border-ink-200 px-2.5 py-0.5 text-[12px] font-medium tabular-nums text-ink-900 transition-colors hover:border-ink-900"
                    >
                      <span>${rawSymbol}</span>
                      {deltaWeight !== null && (
                        <span
                          className={cn(
                            "tabular-nums",
                            deltaWeight > 0
                              ? "text-positive"
                              : deltaWeight < 0
                                ? "text-negative"
                                : "text-ink-500",
                          )}
                        >
                          {deltaWeight > 0 ? "+" : ""}
                          {deltaWeight.toFixed(1)}pp
                        </span>
                      )}
                      {prevWeight !== null && newWeight !== null && (
                        <span className="font-normal text-ink-500 tabular-nums">
                          ({formatPctPlain(prevWeight, 1)} → {formatPctPlain(newWeight, 1)})
                        </span>
                      )}
                    </Link>
                  </div>
                )}

                {/* Título */}
                <h3 className="mt-2.5 text-[17px] font-medium tracking-[-0.02em] text-ink-900">
                  {alert.title}
                </h3>

                {/* Resumen AI */}
                {alert.summary ? (
                  <div className="mt-3 border-l-2 border-ink-900 pl-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] text-ink-500">Resumen AI</p>
                      {!isPro && (
                        <Link
                          href="/upgrade?plan=pro"
                          className="text-[12px] text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
                        >
                          Activar alertas en tiempo real en Pro →
                        </Link>
                      )}
                    </div>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink-900">
                      {alert.summary}
                    </p>
                  </div>
                ) : !isPro ? (
                  <div className="mt-3 border-l-2 border-ink-900 pl-4">
                    <p className="text-[13px] text-ink-500">
                      El resumen AI de esta alerta está disponible en el{" "}
                      <Link
                        href="/upgrade?plan=pro"
                        className="font-medium text-ink-900 underline-offset-4 hover:underline"
                      >
                        plan Pro
                      </Link>
                      .
                    </p>
                  </div>
                ) : null}

                {/* Acciones: portafolio + explicación con IA */}
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <Link
                    href={`/portfolio/${alert.portfolio.slug}`}
                    className="inline-flex items-center gap-1 text-[13px] text-ink-500 hover:text-ink-900"
                  >
                    Ver portafolio
                    <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleExplain(alert)}
                    disabled={explain?.status === "loading"}
                    aria-expanded={explain?.status === "done" ? explain.open : undefined}
                    className="inline-flex items-center border border-ink-200 px-3 py-1.5 text-[13px] text-ink-900 transition-colors hover:border-ink-900 disabled:cursor-wait disabled:text-ink-500"
                  >
                    {explainLabel}
                  </button>
                </div>

                {explain?.status === "error" && (
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
                    {explain.error}
                  </p>
                )}

                {explain?.status === "done" && explain.open && (
                  <div className="mt-3 border border-ink-200 p-4">
                    <p className="text-[13px] text-ink-500">Explicación simple · IA</p>
                    <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink-900">
                      {explain.text}
                    </p>
                    {explain.sources.length > 0 && (
                      <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
                        Fuente:{" "}
                        {explain.sources.map((source, index) => (
                          <span key={`${source.label}-${index}`}>
                            {index > 0 ? " · " : null}
                            {source.href ? (
                              <a
                                href={source.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-ink-900 underline underline-offset-4"
                              >
                                {source.label}
                              </a>
                            ) : (
                              source.label
                            )}
                          </span>
                        ))}
                        .
                      </p>
                    )}
                    <div className="mt-3">
                      <LegalNotice kind="fintec" />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="border border-ink-200 p-12 text-center">
          <BellRing className="mx-auto size-7 text-ink-500" strokeWidth={1.5} />
          {view === "following" && followedCount === 0 ? (
            <>
              <p className="mt-4 text-[17px] font-medium tracking-[-0.02em] text-ink-900">
                Aún no sigues portafolios
              </p>
              <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-500">
                Sigue hasta 2 portafolios gratis para filtrar aquí sus movimientos o explora el
                feed global en tiempo real.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setView("global")}
                  className="rounded-full bg-ink-900 px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-black"
                >
                  Ver feed global
                </button>
                <Link
                  href="/explore"
                  className="text-[14px] text-ink-900 underline-offset-4 hover:underline"
                >
                  Explorar portafolios →
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-[17px] font-medium tracking-[-0.02em] text-ink-900">
                Sin alertas para este filtro
              </p>
              <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-500">
                Prueba con otro ticker, cambia de pestaña o limpia los filtros activos.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 inline-block text-[14px] font-medium text-ink-900 underline-offset-4 hover:underline"
                >
                  Limpiar filtros →
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
