"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Briefcase,
  Building2,
  Cpu,
  FileText,
  Landmark,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortfolioCategory } from "@/lib/types";
import { EtfTickerAvatar } from "@/components/etf-ticker-avatar";
import {
  avatarGradient,
  avatarInitials,
  avatarSource,
  categoryIcon,
  etfTickerForSlug,
} from "@/lib/portfolio-avatar";

/**
 * PortfolioAvatar — avatar de un portafolio (D4).
 *
 * Orden: ETF (ticker tipográfico, D11) > retrato oficial (/portraits) >
 * portada (/covers) > degradado determinista con iniciales + ícono de
 * categoría.
 *
 * Decorativo por diseño: el nombre siempre aparece al lado, así que la
 * imagen lleva `alt=""` y el conjunto `aria-hidden`. El crédito del retrato
 * va en el `title` del contenedor (hover) o en `PortraitCredit` (hero).
 */

const ICONS: Record<string, LucideIcon> = {
  Landmark,
  Briefcase,
  Building2,
  FileText,
  Cpu,
  Sparkles,
};

export type AvatarSize = 16 | 40 | 64 | 96;

const CONTAINER_CLASS: Record<AvatarSize, string> = {
  16: "size-4 rounded-full",
  40: "size-10 rounded-2xl",
  64: "size-16 rounded-2xl",
  96: "size-24 rounded-2xl",
};

const INITIALS_CLASS: Record<AvatarSize, string> = {
  16: "text-[7px]",
  40: "text-[13px]",
  64: "text-[19px]",
  96: "text-[28px]",
};

/** Esquina inferior: solo desde 40px (en 16 no cabría). */
const BADGE_CLASS: Record<AvatarSize, string> = {
  16: "",
  40: "bottom-0.5 right-0.5 rounded-[4px] p-[3px]",
  64: "bottom-1 right-1 rounded-md p-1",
  96: "bottom-1.5 right-1.5 rounded-lg p-1.5",
};

const BADGE_ICON_CLASS: Record<AvatarSize, string> = {
  16: "",
  40: "size-2",
  64: "size-3",
  96: "size-4",
};

/** Campos del portafolio que el avatar necesita. */
export interface AvatarPortfolio {
  slug: string;
  name: string;
  category: PortfolioCategory;
  cover_image: string | null;
  /** Opcional: sin migración 055 aplicada llega undefined. */
  portrait_image?: string | null;
}

interface PortfolioAvatarProps {
  portfolio: AvatarPortfolio;
  /** Tamaño en px: 16 | 40 | 64 | 96. */
  size?: AvatarSize;
  className?: string;
  /** Texto del atributo title (p. ej. el crédito del retrato). */
  title?: string;
}

export function PortfolioAvatar({
  portfolio,
  size = 64,
  className,
  title,
}: PortfolioAvatarProps) {
  const [failed, setFailed] = useState(false);

  // D11: si el portafolio replica un ETF (ARK, Global X, iShares, VanEck,
  // NANC/GOP) manda el avatar tipográfico blanco y negro. Se resuelve antes
  // de la imagen para que todas las vistas lo hereden sin tocarlas.
  const ticker = etfTickerForSlug(portfolio.slug);
  if (ticker) {
    return (
      <EtfTickerAvatar
        ticker={ticker}
        size={size}
        className={cn(CONTAINER_CLASS[size], className)}
      />
    );
  }

  const source = avatarSource(portfolio);
  const showImage =
    !failed && (source.kind === "portrait" || source.kind === "cover");

  const Icon = ICONS[categoryIcon(portfolio.category)] ?? Sparkles;

  return (
    <span
      aria-hidden="true"
      title={title}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-gradient-to-br",
        avatarGradient(portfolio.slug),
        CONTAINER_CLASS[size],
        className,
      )}
    >
      {showImage ? (
        <Image
          src={source.src}
          alt=""
          fill
          sizes={`${size}px`}
          onError={() => setFailed(true)}
          className="object-cover"
        />
      ) : (
        <>
          <span
            className={cn(
              "font-semibold uppercase tracking-wide text-white",
              INITIALS_CLASS[size],
            )}
          >
            {avatarInitials(portfolio.name)}
          </span>
          {size >= 40 ? (
            <span
              className={cn(
                "absolute rounded bg-black/30 text-white",
                BADGE_CLASS[size],
              )}
            >
              <Icon className={BADGE_ICON_CLASS[size]} strokeWidth={2.5} />
            </span>
          ) : null}
        </>
      )}
    </span>
  );
}
