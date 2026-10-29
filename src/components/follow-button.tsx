"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

interface FollowButtonProps {
  portfolioId: string;
  initialFollowing: boolean;
  initialIsPro: boolean;
  portfolioPremium: boolean;
  /** "card" shows in a portfolio card; "page" shows on the detail page. */
  variant?: "card" | "page";
}

export function FollowButton({
  portfolioId,
  initialFollowing,
  initialIsPro,
  portfolioPremium,
  variant = "card",
}: FollowButtonProps) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const requiresPro = portfolioPremium && !initialIsPro;
  // D55: seguir es solo para planes pagados. Free ve el aviso en vez de
  // seguir (el servidor también lo bloquea). Dejar de seguir sigue permitido.
  const [upsell, setUpsell] = useState(false);

  function handleClick() {
    if (!initialIsPro && !following) {
      track("follow", { portfolioId, upsell: true });
      setUpsell(true);
      return;
    }

    setError(null);
    // d63: UI optimista. Se muestra el nuevo estado al instante y se revierte
    // si el servidor rechaza (403 del muro de pago, 401, error de red).
    const previous = following;
    setFollowing(!previous);
    startTransition(async () => {
      track("follow", { portfolioId, following: !previous });
      let data: { ok?: boolean; following?: boolean; upgrade?: unknown; error?: string; redirect?: string } = {};
      let status = 0;
      try {
        const res = await fetch("/api/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portfolioId }),
        });
        status = res.status;
        data = await res.json().catch(() => ({}));
      } catch {
        setFollowing(previous);
        setError("No se pudo conectar. Intenta de nuevo.");
        return;
      }
      if (data.ok) {
        setFollowing(Boolean(data.following));
        router.refresh();
        return;
      }
      setFollowing(previous);
      if (data.upgrade || status === 403) {
        setUpsell(true);
      } else if (data.error) {
        setError(data.error);
        if (data.redirect) router.push(data.redirect);
      } else {
        setError("No se pudo actualizar. Intenta de nuevo.");
      }
    });
  }

  const size = variant === "page" ? "lg" : "sm";
  // En el detalle, el botón ocupa todo el ancho de su columna (apilado móvil preciso).
  const width = variant === "page" ? "w-full" : "";

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant={following || requiresPro ? "outline" : "primary"}
        size={size}
        loading={isPending}
        onClick={handleClick}
        className={width}
        aria-label={following ? "Dejar de seguir" : "Seguir portafolio"}
      >
        {following ? (
          <>
            <Check className="size-4" />
            Siguiendo
          </>
        ) : requiresPro ? (
          <>
            <Plus className="size-4" />
            Pro
          </>
        ) : (
          <>
            <Plus className="size-4" />
            Seguir
          </>
        )}
      </Button>
      {error && <p className="text-xs font-medium text-negative">{error}</p>}
      {upsell ? (
        <div role="status" className="rounded-xl border border-ink-200 bg-white p-3 text-left shadow-sm">
          <p className="text-[13px] font-medium text-ink-900">Seguir es para suscriptores</p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-500">
            Suscríbete para seguir portafolios y recibir sus movimientos.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <a
              href="/upgrade"
              className="inline-flex h-8 items-center rounded-full bg-ink-900 px-3 text-[12px] font-medium text-white hover:bg-black"
            >
              Ver planes
            </a>
            <button type="button" onClick={() => setUpsell(false)} className="text-[12px] text-ink-500 hover:text-ink-900">
              Ahora no
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
