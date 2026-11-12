"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, LazyMotion, m, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { loadMotionFeatures } from "@/lib/load-motion-features";
import { ButtonLink } from "@/components/ui/button";
import { LogoLockup } from "@/components/logo";

/**
 * d65: menú móvil a pantalla completa del SiteHeader, separado para que
 * framer-motion se descargue solo al abrirlo (import dinámico). Va en un
 * portal a <body>: el header usa `transform` (translate-y al ocultarse), que
 * crea un containing block y dejaba el panel "fixed" atrapado sobre el hero.
 */
export function MobileMenu({
  open,
  onClose,
  links,
}: {
  open: boolean;
  onClose: () => void;
  links: readonly { href: string; label: string }[];
}) {
  const reduced = useReducedMotion();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return (
    <>
      {createPortal(
      <LazyMotion features={loadMotionFeatures}>
      <AnimatePresence>
        {open && (
          <m.div
            id="menu-movil"
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            className="fixed inset-0 z-[100] flex flex-col overflow-y-auto overscroll-contain bg-white lg:hidden dark:bg-ink-950"
            initial={reduced ? undefined : { opacity: 0, y: -8 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="container-page flex h-16 shrink-0 items-center justify-between border-b border-ink-300 dark:border-white/12">
              <Link
                href="/"
                aria-label="Fraccion inicio"
                onClick={() => onClose()}
                className="shrink-0"
              >
                <LogoLockup className="dark:text-white" />
              </Link>
              <button
                type="button"
                autoFocus
                onClick={() => onClose()}
                aria-label="Cerrar menú"
                className="inline-flex size-10 items-center justify-center rounded-full text-ink-900 transition-colors hover:bg-ink-100 dark:text-white dark:hover:bg-white/10"
              >
                <X className="size-6" />
              </button>
            </div>
            <m.nav
              className="container-page flex flex-1 flex-col pt-4"
              aria-label="Principal móvil"
              initial={reduced ? undefined : "hidden"}
              animate={reduced ? undefined : "visible"}
              variants={{
                visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
              }}
            >
              {links.map((link) => (
                <m.div
                  key={link.href}
                  variants={{
                    hidden: { opacity: 0, y: 14 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
                    },
                  }}
                >
                  <Link
                    href={link.href}
                    onClick={() => onClose()}
                    className="block border-b border-ink-200 py-3 text-[clamp(1.35rem,5.5vw,1.75rem)] font-semibold leading-tight tracking-[-0.03em] text-ink-900 transition-colors hover:text-ink-600 dark:border-white/12 dark:text-white dark:hover:text-ink-300"
                  >
                    {link.label}
                  </Link>
                </m.div>
              ))}
            </m.nav>
            <m.div
              className="container-page flex flex-col gap-2.5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
              initial={reduced ? undefined : { opacity: 0, y: 14 }}
              animate={reduced ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.24 }}
            >
              <Link
                href="/login"
                onClick={() => onClose()}
                className="inline-flex h-11 w-full items-center justify-center rounded-full border border-ink-300 text-[15px] font-medium text-ink-900 transition-colors hover:bg-ink-50 dark:border-white/20 dark:text-white dark:hover:bg-white/5"
              >
                Entrar
              </Link>
              <ButtonLink
                href="/signup"
                size="md"
                className="w-full"
                onClick={() => onClose()}
              >
                Empezar
              </ButtonLink>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
      </LazyMotion>,
      document.body,
      )}
    </>
  );
}
