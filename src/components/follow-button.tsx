"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  function handleClick() {
    if (requiresPro) {
      router.push("/#precios");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId }),
      });
      const data = await res.json();
      if (data.ok) {
        setFollowing(data.following);
        router.refresh();
      } else if (data.error) {
        setError(data.error);
        if (data.redirect) router.push(data.redirect);
      }
    });
  }

  const size = variant === "page" ? "lg" : "sm";

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant={following || requiresPro ? "outline" : "primary"}
        size={size}
        loading={isPending}
        onClick={handleClick}
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
    </div>
  );
}
