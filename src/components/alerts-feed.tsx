"use client";

import { useMemo, useState } from "react";
import { AppLink as Link } from "@/components/app/app-link";
import { ArrowUpRight, BellRing, Search, X } from "lucide-react";
import type { Alert, AlertType, PortfolioCategory } from "@/lib/types";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
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
    cover_image?: string | null;
    portrait_image?: string | null;
  };
}

interface AlertsFeedProps {
  alerts: EnrichedAlert[];
  followedIds: string[];
  isPro: boolean;
  /** False sin clave de OpenRouter: se ocultan los CTA de IA. */
  aiEnabled?: boolean;
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

export function AlertsFeed({ alerts, followedIds, isPro, aiEnabled = true }: AlertsFeedProps) {
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

  const groups = useMemo(() => groupByDay(filteredAlerts), [filteredAlerts]);

  const VIEWS: { value: ViewTab; label: string }[] = [
    { value: "global", label: "Global" },
    { value: "following", label: `Siguiendo (${followedCount})` },
    { value: "leaders", label: "Líderes" },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* 1. Segmented control de vista */}
      <div
        className="grid w-full grid-cols-3 rounded-[10px] bg-ink-100 p-1 sm:w-auto sm:max-w-md"
        role="tablist"
        aria-label="Vista de alertas"
      >
        {VIEWS.map((item) => {
          const active = view === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(item.value)}
              className={cn(
                "h-9 min-w-0 truncate rounded-[8px] px-2 text-[13px] tabular-nums transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900",
                active
                  ? "bg-white font-medium text-ink-900 shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                  : "text-ink-500 hover:text-ink-900",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* 2. Buscador + chips de tipo */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="relative min-w-0">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-500"
            strokeWidth={1.75}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ticker, político o fondo"
            aria-label="Filtra por ticker, político o fondo"
            className="h-11 w-full rounded-[10px] border border-app-border bg-white pr-11 pl-10 text-[15px] text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-none"
          />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              aria-label="Limpiar filtros"
              className="absolute top-1/2 right-2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          )}
        </div>

        <div className="-mx-4 overflow-x-auto no-scrollbar px-4 sm:mx-0 sm:px-0">
          <div className="flex w-max items-center gap-2" role="group" aria-label="Filtrar por tipo de alerta">
            {TYPE_FILTERS.map((item) => {
              const active = typeFilter === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTypeFilter(item.value)}
                  className={cn(
                    "h-8 shrink-0 rounded-full border px-3.5 text-[13px] transition-colors",
                    active
                      ? "border-ink-900 bg-ink-900 font-medium text-white"
                      : "border-app-border bg-white text-ink-600 hover:border-ink-900 hover:text-ink-900",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[12px] tabular-nums text-ink-500">
          {filteredAlerts.length} {filteredAlerts.length === 1 ? "alerta" : "alertas"}
        </p>
      </div>

      {/* 3. Feed agrupado por día */}
      {groups.length > 0 ? (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label} className="flex flex-col gap-2">
              <h2 className="sticky top-0 z-[1] -mx-1 bg-app-canvas/90 px-1 py-1.5 text-[12px] font-medium tracking-wide text-ink-500 uppercase backdrop-blur">
                {group.label}
              </h2>
              <div className="overflow-hidden rounded-app border border-app-border bg-white shadow-app">
                {group.items.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    isPro={isPro}
                    aiEnabled={aiEnabled}
                    explain={explanations[alert.id]}
                    onExplain={() => handleExplain(alert)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-app border border-app-border bg-white px-6 py-12 text-center shadow-app">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-ink-100">
            <BellRing className="size-5 text-ink-600" strokeWidth={1.75} />
          </span>
          {view === "following" && followedCount === 0 ? (
            <>
              <p className="mt-4 text-[17px] font-medium tracking-[-0.02em] text-ink-900">
                Aún no sigues portafolios
              </p>
              <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink-500">
                Sigue portafolios para ver aquí solo sus movimientos, o revisa el feed global.
              </p>
              <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/explore"
                  className="inline-flex h-10 items-center rounded-full bg-ink-900 px-5 text-[14px] font-medium text-white hover:bg-black"
                >
                  Explorar portafolios
                </Link>
                <button
                  type="button"
                  onClick={() => setView("global")}
                  className="inline-flex h-10 items-center rounded-full border border-app-border px-5 text-[14px] text-ink-900 hover:border-ink-900"
                >
                  Ver feed global
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-[17px] font-medium tracking-[-0.02em] text-ink-900">
                Sin alertas para este filtro
              </p>
              <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink-500">
                Prueba con otro ticker, cambia de vista o limpia los filtros.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-5 inline-flex h-10 items-center rounded-full bg-ink-900 px-5 text-[14px] font-medium text-white hover:bg-black"
                >
                  Limpiar filtros
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Agrupación por día ---------- */

interface DayGroup {
  key: string;
  label: string;
  items: EnrichedAlert[];
}

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DAY_LABEL = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  weekday: "long",
  day: "numeric",
  month: "long",
});

function dayKey(date: Date): string {
  return DAY_KEY.format(date);
}

function groupByDay(list: EnrichedAlert[]): DayGroup[] {
  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const map = new Map<string, DayGroup>();
  for (const alert of list) {
    const d = new Date(alert.created_at);
    const valid = Number.isFinite(d.getTime());
    const key = valid ? dayKey(d) : "sin-fecha";
    let group = map.get(key);
    if (!group) {
      const label = !valid
        ? "Sin fecha"
        : key === today
          ? "Hoy"
          : key === yesterday
            ? "Ayer"
            : DAY_LABEL.format(d);
      group = { key, label, items: [] };
      map.set(key, group);
    }
    group.items.push(alert);
  }
  return [...map.values()];
}

/* ---------- Fila de alerta ---------- */

const CHIP_CLASS: Partial<Record<AlertType, string>> = {
  new_trade: "bg-ink-900 text-white",
  sold_trade: "border border-ink-900 bg-white text-ink-900",
  mention: "bg-ink-100 text-ink-900",
};

function AlertRow({
  alert,
  isPro,
  aiEnabled,
  explain,
  onExplain,
}: {
  alert: EnrichedAlert;
  isPro: boolean;
  aiEnabled: boolean;
  explain: ExplainState | undefined;
  onExplain: () => void;
}) {
  const payload = alert.payload ?? {};
  const rawSymbol =
    typeof alert.payload?.symbol === "string" && alert.payload.symbol.trim().length > 0
      ? alert.payload.symbol.trim().toUpperCase()
      : null;
  const prevWeight =
    typeof alert.payload?.previous_weight === "number" ? alert.payload.previous_weight : null;
  const newWeight = typeof alert.payload?.new_weight === "number" ? alert.payload.new_weight : null;
  const deltaWeight = prevWeight !== null && newWeight !== null ? newWeight - prevWeight : null;
  const explainLabel =
    explain?.status === "loading"
      ? "Explicando…"
      : explain?.status === "error"
        ? "Reintentar"
        : explain?.status === "done" && explain.open
          ? "Ocultar"
          : explain?.status === "done"
            ? "Ver explicación"
            : "Explicar con IA";
  const time = (() => {
    const d = new Date(alert.created_at);
    return Number.isFinite(d.getTime())
      ? new Intl.DateTimeFormat("es-CL", {
          timeZone: "America/Santiago",
          hour: "2-digit",
          minute: "2-digit",
        }).format(d)
      : "";
  })();

  return (
    <article className="flex min-w-0 gap-3 border-t border-app-border p-4 first:border-t-0 sm:gap-4 sm:p-5">
      <Link
        href={`/portfolio/${alert.portfolio.slug}`}
        className="shrink-0"
        aria-label={alert.portfolio.name}
      >
        <PortfolioAvatar
          portfolio={{
            slug: alert.portfolio.slug,
            name: alert.portfolio.name,
            category: alert.portfolio.category,
            cover_image: alert.portfolio.cover_image ?? null,
            portrait_image: alert.portfolio.portrait_image ?? null,
          }}
          size={40}
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/portfolio/${alert.portfolio.slug}`}
              className="block truncate text-[14px] font-medium text-ink-900 hover:underline underline-offset-4"
            >
              {alert.portfolio.name}
            </Link>
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-ink-500">
              {alert.portfolio.manager && alert.portfolio.manager !== alert.portfolio.name && (
                <span className="truncate">{alert.portfolio.manager} ·</span>
              )}
              <span className="tabular-nums" title={timeAgo(alert.created_at)}>
                {time}
              </span>
              <LagBadge
                publishedAt={publishedAtFromPayload(payload)}
                recordedAt={alert.created_at}
                lagDays={lagDays(payload)}
                leadingDot
              />
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
              CHIP_CLASS[alert.type] ?? "border border-app-border text-ink-600",
            )}
          >
            {TYPE_LABEL[alert.type] ?? "Alerta"}
          </span>
        </div>

        <h3 className="mt-2 text-[15px] leading-snug font-medium tracking-[-0.01em] text-ink-900 [overflow-wrap:anywhere]">
          {alert.title}
        </h3>

        {rawSymbol && (
          <Link
            href={`/accion/${encodeURIComponent(rawSymbol.toLowerCase())}`}
            className="mt-2 inline-flex max-w-full items-center gap-2 rounded-[8px] bg-ink-100 px-2.5 py-1 text-[12px] font-medium tabular-nums text-ink-900 hover:bg-ink-200"
          >
            <span>{rawSymbol}</span>
            {deltaWeight !== null && (
              <span
                className={cn(
                  "tabular-nums",
                  deltaWeight > 0 ? "text-positive" : deltaWeight < 0 ? "text-negative" : "text-ink-500",
                )}
              >
                {deltaWeight > 0 ? "+" : ""}
                {deltaWeight.toFixed(1)}pp
              </span>
            )}
            {prevWeight !== null && newWeight !== null && (
              <span className="truncate font-normal text-ink-500">
                {formatPctPlain(prevWeight, 1)} → {formatPctPlain(newWeight, 1)}
              </span>
            )}
          </Link>
        )}

        {alert.summary ? (
          <div className="mt-3 rounded-[8px] bg-app-canvas p-3">
            <p className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">Resumen IA</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-900">{alert.summary}</p>
          </div>
        ) : !isPro && aiEnabled ? (
          <p className="mt-3 text-[13px] text-ink-500">
            Resumen IA disponible en{" "}
            <Link href="/upgrade?plan=pro" className="font-medium text-ink-900 underline underline-offset-4">
              Pro
            </Link>
            .
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {aiEnabled ? (
          <button
            type="button"
            onClick={onExplain}
            disabled={explain?.status === "loading"}
            aria-expanded={explain?.status === "done" ? explain.open : undefined}
            className="inline-flex h-8 items-center rounded-full border border-app-border px-3 text-[13px] text-ink-900 transition-colors hover:border-ink-900 disabled:cursor-wait disabled:text-ink-500"
          >
            {explainLabel}
          </button>
          ) : null}
          <Link
            href={`/portfolio/${alert.portfolio.slug}`}
            className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          >
            Ver portafolio
            <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
          </Link>
        </div>

        {explain?.status === "error" && (
          <p className="mt-2 text-[13px] leading-relaxed text-ink-600">{explain.error}</p>
        )}

        {explain?.status === "done" && explain.open && (
          <div className="mt-3 rounded-[8px] border border-app-border p-3">
            <p className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">Explicación simple · IA</p>
            <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-ink-900">{explain.text}</p>
            {explain.sources.length > 0 && (
              <p className="mt-2 text-[12px] leading-relaxed text-ink-500 [overflow-wrap:anywhere]">
                Fuente:{" "}
                {explain.sources.map((source, index) => (
                  <span key={`${source.label}-${index}`}>
                    {index > 0 ? " · " : null}
                    {source.href ? (
                      <a href={source.href} target="_blank" rel="noopener noreferrer" className="text-ink-900 underline underline-offset-4">
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
      </div>
    </article>
  );
}
