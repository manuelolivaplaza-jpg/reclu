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
 * d80: tab bar móvil de cabina. Blanca sólida, filete superior de 1px,
 * 5 columnas de 64px, indicador negro de 2px en la pestaña activa.
 * Sin blur ni sombras: el filete hace todo el trabajo.
 */
export function MobileTabBar({ myPortfolio }: { myPortfolio: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = mobileTabs(myPortfolio);
  const extra = moreItems(myPortfolio);
  const tabActive = tabs.some((t) => isActivePath(pathname, t.href, t.match));
  const moreActive = !tabActive && extra.some((t) => isActivePath(pathname, t.href, t.match));

  const cell =
    "relative flex h-full w-full flex-col items-center justify-center gap-1.5 px-1 text-[11px] leading-none tracking-[-0.01em] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-900";

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid h-16 grid-cols-5">
          {tabs.map((t) => {
            const active = isActivePath(pathname, t.href, t.match);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(cell, active ? "font-medium text-ink-900" : "font-normal text-ink-500")}
                >
                  {active && <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-ink-900" />}
                  <AppIcon name={t.icon} className="size-[20px] shrink-0" strokeWidth={active ? 1.9 : 1.6} />
                  <span className="max-w-full truncate">{t.short ?? t.label}</span>
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
              className={cn(cell, moreActive ? "font-medium text-ink-900" : "font-normal text-ink-500")}
            >
              {moreActive && <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-ink-900" />}
              <AppIcon name="Menu" className="size-[20px] shrink-0" strokeWidth={moreActive ? 1.9 : 1.6} />
              <span className="max-w-full truncate">Más</span>
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={extra} />
    </>
  );
}
