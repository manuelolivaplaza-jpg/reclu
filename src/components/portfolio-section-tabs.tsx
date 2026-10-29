"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface SectionTab {
  /** id del elemento destino en la página (sin #). */
  id: string;
  label: string;
}

const DEFAULT_TABS: SectionTab[] = [
  { id: "resumen", label: "Resumen" },
  { id: "posiciones", label: "Posiciones" },
  { id: "movimientos", label: "Movimientos" },
];

/**
 * Pestañas pegajosas Resumen / Posiciones / Movimientos para la ficha de
 * portafolio (P4). Navegan por ancla y marcan la sección visible con
 * IntersectionObserver. Solo datos planos como props.
 */
export function PortfolioSectionTabs({
  tabs = DEFAULT_TABS,
  className,
}: {
  tabs?: SectionTab[];
  className?: string;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  useEffect(() => {
    const targets = tabs
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => !!el);
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [tabs]);

  return (
    <nav
      aria-label="Secciones del portafolio"
      className={cn(
        "sticky top-[var(--app-topbar-h,0px)] z-20 -mx-4 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:mx-0 sm:px-0",
        className,
      )}
    >
      <ul className="flex gap-6 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <li key={t.id}>
              <a
                href={`#${t.id}`}
                aria-current={isActive ? "true" : undefined}
                onClick={() => setActive(t.id)}
                className={cn(
                  "relative inline-flex h-12 items-center whitespace-nowrap text-[15px] font-medium transition-colors",
                  isActive ? "text-ink-900" : "text-ink-500 hover:text-ink-900",
                )}
              >
                {t.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-0.5 rounded-full transition-colors",
                    isActive ? "bg-ink-900" : "bg-transparent",
                  )}
                />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
