"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FollowButton } from "@/components/follow-button";
import type { Portfolio } from "@/lib/types";
import { CATEGORY_META } from "@/lib/types";
import { formatCompact } from "@/lib/utils";

interface OnboardingSuggestionsProps {
  /** Portafolios populares sugeridos (máx. 3, ya resueltos en el server). */
  suggestions: Portfolio[];
  isPro: boolean;
}

/**
 * OnboardingSuggestions — primer uso guiado (E3). Se muestra cuando el
 * usuario no sigue nada: 3 portafolios populares con botón "Seguir" de un
 * clic. Estética monocroma: filetes 1px, números tabulares, cero color
 * salvo retornos en verde/rojo.
 */
export function OnboardingSuggestions({ suggestions, isPro }: OnboardingSuggestionsProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || suggestions.length === 0) return null;

  return (
    <section
      aria-labelledby="onboarding-heading"
      className="border border-ink-900 p-6 sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-line">Primeros pasos</p>
          <h2 id="onboarding-heading" className="mt-2 text-[20px] font-medium tracking-[-0.03em] text-ink-900">
            Sigue tus primeros portafolios
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-500">
            Empieza con los más seguidos. Al seguir un portafolio recibes alertas
            por email cada vez que cambia su composición.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex size-11 shrink-0 items-center justify-center text-ink-500 transition-colors hover:text-ink-900"
          aria-label="Ocultar sugerencias"
        >
          <svg
            className="size-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <ul className="mt-6 grid gap-5 sm:grid-cols-3">
        {suggestions.map((portfolio, index) => (
          <li
            key={portfolio.id}
            className="flex flex-col border border-ink-200 p-5"
          >
            <div className="flex items-center justify-between">
              <span className="num text-[11px] text-ink-400">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-[11px] tracking-[0.08em] text-ink-500 uppercase">
                {CATEGORY_META[portfolio.category].label}
              </span>
            </div>

            <Link
              href={`/portfolio/${portfolio.slug}`}
              className="mt-3 block text-[17px] font-medium tracking-[-0.02em] text-ink-900 underline-offset-4 hover:underline"
            >
              {portfolio.name}
            </Link>
            {portfolio.manager && (
              <p className="mt-0.5 text-[13px] text-ink-500">{portfolio.manager}</p>
            )}

            {portfolio.return_ytd !== null && (
              <p className="num mt-3 text-[15px] font-medium">
                <span className={(portfolio.return_ytd ?? 0) >= 0 ? "text-positive" : "text-negative"}>
                  {(portfolio.return_ytd ?? 0) >= 0 ? "+" : ""}
                  {portfolio.return_ytd?.toFixed(1)}%
                </span>
                <span className="ml-2 text-[12px] font-normal text-ink-500">YTD</span>
              </p>
            )}

            <p className="mt-2 text-[13px] text-ink-500">
              {formatCompact(portfolio.followers)} seguidores
            </p>

            <div className="mt-5 border-t border-ink-200 pt-4">
              <FollowButton
                portfolioId={portfolio.id}
                initialFollowing={false}
                initialIsPro={isPro}
                portfolioPremium={portfolio.premium}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-5">
        <p className="text-[13px] text-ink-500">
          Plan gratuito: 2 portafolios con alertas diarias.
        </p>
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-900 underline-offset-4 hover:underline"
        >
          Ver los 40+ portafolios
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
