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
 * portal a <body>: el header usa backdrop-blur y transform, que crean un
 * containing block y dejaban el panel "fixed" atrapado sobre el hero.
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
            className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-white lg:hidden"
            initial={reduced ? undefined : { opacity: 0, y: -8 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="container-page flex h-16 shrink-0 items-center justify-between border-b border-neutral-200/70">
              <Link
                href="/"
                aria-label="reclu inicio"
                onClick={() => onClose()}
                className="rounded-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
              >
                <LogoLockup />
              </Link>
              <button
                type="button"
                autoFocus
                onClick={() => onClose()}
                aria-label="Cerrar menú"
                className="inline-flex size-10 items-center justify-center rounded-full text-neutral-950 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
              >
                <X className="size-6" />
              </button>
            </div>
            <m.nav
              className="container-page flex flex-1 flex-col pt-6"
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
                    className="block border-b border-neutral-100 py-4 text-[28px] font-semibold tracking-tight text-neutral-950 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
                   
                  >
                    {link.label}
                  </Link>
                </m.div>
              ))}
            </m.nav>
            <m.div
              className="container-page flex flex-col gap-3 pt-8 pb-[calc(env(safe-area-inset-bottom)+2rem)]"
              initial={reduced ? undefined : { opacity: 0, y: 14 }}
              animate={reduced ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.24 }}
            >
              <Link
                href="/login"
                onClick={() => onClose()}
                className="inline-flex h-12 w-full items-center justify-center rounded-full border border-neutral-200 text-[15px] font-medium text-neutral-950 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
              >
                Entrar
              </Link>
              <ButtonLink
                href="/signup"
                size="lg"
                className="w-full rounded-full bg-neutral-950 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
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
