"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOverlapForSymbols } from "@/app/actions/holdings";
import { LegalNotice } from "@/components/legal/legal-notice";
import { CATEGORY_META, type PortfolioCategory } from "@/lib/types";
import type { OverlapEntry, OverlapHolder } from "@/lib/import-holdings";

/**
 * Frase de coincidencia: "Nancy Pelosi, Berkshire Hathaway y tu AFP también
 * tienen NVDA." Las carteras de AFP se mencionan como "tu AFP" para que la
 * frase se lea natural; no se inventan nombres de personas.
 */
export function overlapSentence(symbol: string, holders: OverlapHolder[]): string {
  if (holders.length === 0) {
    return `Ninguna cartera del catálogo reporta ${symbol} todavía.`;
  }

  const names: string[] = [];
  for (const holder of holders) {
    const name = isAfp(holder) ? "tu AFP" : holder.name;
    if (!names.includes(name)) names.push(name);
  }

  const shown = names.slice(0, 3);
  const extra = names.length - shown.length;
  const list = formatList(shown);
  const suffix =
    extra > 0 ? ` y ${extra} ${extra === 1 ? "cartera más" : "carteras más"}` : "";
  const verb = names.length === 1 ? "tiene" : "tienen";
  return `${list}${suffix} también ${verb} ${symbol}.`;
}

function isAfp(holder: OverlapHolder): boolean {
  return /\bafp\b/i.test(holder.name);
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function categoryLabel(category: string): string {
  const meta = CATEGORY_META[category as PortfolioCategory];
  return meta?.label ?? category;
}

/**
 * Panel "quién más tiene lo mismo": consulta la RPC 015 para los símbolos de
 * la cartera y muestra las carteras públicas que también los tienen.
 * La cartera del usuario nunca sale del navegador como lista: solo los
 * símbolos viajan a una server action autenticada.
 */
export function OverlapPanel({ symbols }: { symbols: string[] }) {
  const key = Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean),
    ),
  )
    .sort()
    .join("|");

  const [result, setResult] = useState<{
    key: string;
    entries: OverlapEntry[];
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!key) return;

    let alive = true;
    getOverlapForSymbols(key.split("|"))
      .then((response) => {
        if (!alive) return;
        setResult(
          response.error
            ? { key, entries: [], error: true }
            : { key, entries: response.overlaps ?? [], error: false },
        );
      })
      .catch(() => {
        if (alive) setResult({ key, entries: [], error: true });
      });

    return () => {
      alive = false;
    };
  }, [key]);

  if (!key) return null;

  const ready = !!result && result.key === key;
  const entries = result && result.key === key ? result.entries : [];
  const loading = !ready;
  const failed = !!result && result.key === key && result.error;

  const withHolders = entries.filter((entry) => entry.totalHolders > 0);
  const withoutHolders = entries.filter((entry) => entry.totalHolders === 0);
  const unavailable = entries.some((entry) => entry.unavailable);

  return (
    <section aria-labelledby="overlap-title" className="border-t border-ink-200 pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="overlap-title" className="text-[15px] font-medium text-ink-900">
          Quién más tiene lo mismo
        </h2>
        {loading && (
          <span className="text-[13px] text-ink-500" role="status">
            Buscando coincidencias…
          </span>
        )}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
        Coincidencias con políticos de EE.UU., corredoras, fondos y AFP del
        catálogo. Tu cartera es privada: no se publica ni se comparte.
      </p>

      {failed || (ready && unavailable) ? (
        <p className="mt-4 border border-ink-200 px-4 py-3 text-[13px] text-ink-500">
          No pudimos consultar las coincidencias ahora. Vuelve a intentarlo en
          unos minutos.
        </p>
      ) : ready && entries.length > 0 ? (
        <>
          {withHolders.length > 0 ? (
            <ul className="mt-4 divide-y divide-ink-100 border-y border-ink-200">
              {withHolders.map((entry) => (
                <li key={entry.symbol} className="py-4">
                  <p className="text-[15px] leading-relaxed text-ink-900">
                    {overlapSentence(entry.symbol, entry.holders)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    {entry.holders.map((holder) => (
                      <Link
                        key={`${entry.symbol}-${holder.portfolioId}`}
                        href={`/portfolio/${holder.slug}`}
                        className="text-[13px] text-ink-600 underline-offset-4 hover:text-ink-900 hover:underline"
                      >
                        {holder.name}
                        <span className="ml-1.5 text-ink-400">
                          {categoryLabel(holder.category)}
                        </span>
                        <span className="ml-1.5 tabular-nums text-ink-500">
                          {holder.weight.toFixed(1)}%
                        </span>
                      </Link>
                    ))}
                    {entry.totalHolders > entry.holders.length && (
                      <span className="text-[13px] text-ink-400">
                        +{entry.totalHolders - entry.holders.length} carteras más
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {withoutHolders.length > 0 && (
            <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
              Sin coincidencias todavía para{" "}
              {formatList(withoutHolders.map((entry) => entry.symbol))}.
            </p>
          )}
        </>
      ) : null}

      <div className="mt-4">
        <LegalNotice kind="fintec" />
      </div>
    </section>
  );
}
