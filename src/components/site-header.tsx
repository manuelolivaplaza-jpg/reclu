"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { LogoLockup } from "@/components/logo";

const NAV_LINKS = [
  { href: "/explore", label: "Portafolios" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#precios", label: "Precios" },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduced = useReducedMotion();

  // Bloquea el scroll del body mientras el menú móvil está abierto.
  // Se restaura al cerrar el menú (incluido el click en cualquier link,
  // que hace setMobileOpen(false) antes de navegar) vía cleanup.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-ink-200 bg-white">
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" aria-label="reclu inicio" className="shrink-0">
          <LogoLockup />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Principal">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-ink-900 transition-opacity hover:opacity-55"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTAs: Entrar es texto, Empezar es píldora */}
        <div className="hidden items-center gap-6 md:flex">
          <Link
            href="/login"
            className="text-sm text-ink-900 transition-opacity hover:opacity-55"
          >
            Entrar
          </Link>
          <ButtonLink href="/signup" size="sm">
            Empezar
          </ButtonLink>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center text-ink-900 md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {/* Mobile nav — pantalla completa blanca, links grandes.
          AnimatePresence: opacidad + y sutil; los links entran escalonados. */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 top-16 z-40 flex flex-col bg-white md:hidden"
            initial={reduced ? undefined : { opacity: 0 }}
            animate={reduced ? undefined : { opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.nav
              className="container-page flex flex-1 flex-col gap-2 pt-8"
              aria-label="Principal móvil"
              initial={reduced ? undefined : "hidden"}
              animate={reduced ? undefined : "visible"}
              variants={{
                visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
              }}
            >
              {NAV_LINKS.map((link) => (
                <motion.div
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
                    onClick={() => setMobileOpen(false)}
                    className="type-section block border-b border-ink-200 py-5 text-ink-900"
                    style={{ fontSize: "clamp(2rem, 6vw, 2.5rem)" }}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div
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
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block border-b border-ink-200 py-5 text-[15px] text-ink-900"
                >
                  Entrar
                </Link>
              </motion.div>
            </motion.nav>
            <motion.div
              className="container-page pb-10"
              initial={reduced ? undefined : { opacity: 0, y: 14 }}
              animate={reduced ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.24 }}
            >
              <ButtonLink
                href="/signup"
                size="lg"
                className="w-full"
                onClick={() => setMobileOpen(false)}
              >
                Empezar
              </ButtonLink>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
