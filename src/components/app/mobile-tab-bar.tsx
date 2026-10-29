"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AppIcon } from "@/components/app/app-icon";
import { isActivePath } from "@/components/app/app-href";
import { mobileTabs, moreItems } from "@/components/app/nav-config";
import { MoreSheet } from "@/components/app/more-sheet";
import { cn } from "@/lib/utils";

/**
 * Tab bar móvil estilo app: fixed, fondo translúcido con blur (liquid glass),
 * safe-area, áreas táctiles ≥ 56px, activo relleno. 4 pestañas + "Más".
 */
export function MobileTabBar({ myPortfolio }: { myPortfolio: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = mobileTabs(myPortfolio);
  const extra = moreItems(myPortfolio);
  const tabActive = tabs.some((t) => isActivePath(pathname, t.href, t.match));
  const moreActive = !tabActive && extra.some((t) => isActivePath(pathname, t.href, t.match));

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/60 bg-white/75 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(16,24,40,0.06)] backdrop-blur-2xl backdrop-saturate-[1.8] lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {tabs.map((t) => {
            const active = isActivePath(pathname, t.href, t.match);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-tight transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink-900",
                    active ? "text-ink-900" : "text-ink-500",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                      active ? "bg-ink-900 text-white" : "bg-transparent",
                    )}
                  >
                    <AppIcon name={t.icon} className="size-[20px]" strokeWidth={active ? 2 : 1.75} />
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-current={moreActive ? "page" : undefined}
              className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-tight focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink-900",
                moreActive ? "text-ink-900" : "text-ink-500",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full",
                  moreActive ? "bg-ink-900 text-white" : "bg-transparent",
                )}
              >
                <AppIcon name="Menu" className="size-[20px]" />
              </span>
              Más
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={extra} />
    </>
  );
}