"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

interface Props {
  title: string;
  body: string;
  href: string;
  cta: string;
  /** Clave de descarte en localStorage. */
  storageKey: string;
}

/** Banner de upgrade compacto y descartable. Solo recibe strings. */
export function UpgradeBanner({ title, body, href, cta, storageKey }: Props) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(storageKey) === "1");
    } catch {
      setHidden(false);
    }
  }, [storageKey]);
  if (hidden) return null;
  return (
    <div className="relative flex items-center gap-4 overflow-hidden rounded-[12px] bg-ink-900 p-4 pr-12 text-white sm:p-5 sm:pr-14">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[13px] text-white/70">{body}</p>
      </div>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-white px-3 py-2 text-[13px] font-semibold text-ink-900 hover:bg-white/90"
      >
        {cta}
        <ArrowRight className="size-4" />
      </Link>
      <button
        type="button"
        aria-label="Ocultar"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(storageKey, "1");
          } catch {}
        }}
        className="absolute top-2 right-2 inline-flex size-9 items-center justify-center rounded-full text-white/60 hover:text-white"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
