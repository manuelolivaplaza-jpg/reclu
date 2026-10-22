"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { LogoLockup } from "@/components/logo";
import { CommandPalette } from "@/components/command-palette";
import { useHideOnScroll } from "@/lib/use-hide-on-scroll";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/explore", label: "Portafolios" },
  { href: "/ranking", label: "Ranking" },
  { href: "/aprende", label: "Aprende" },
  { href: "/herramientas", label: "Herramientas" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#precios", label: "Precios" },
];

/** Enlace simple del nav: gris, se oscurece al hover. */
const linkClass =
  "text-sm text-neutral-600 transition-colors duration-150 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950";

/**
 * SiteHeader — barra de navegación de la home y de las páginas públicas.
 *
 * Blanco translúcido con blur y filete inferior de 1px. Se oculta al bajar
 * y vuelve al subir (`useHideOnScroll`): con el scroll en el top (o casi)
 * siempre está visible. El menú móvil a pantalla completa, el buscador ⌘K
 * y el acceso a sesión se mantienen.
 */
export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduced = useReducedMotion();
  const hidden = useHideOnScroll(10);

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

  // Con el menú móvil abierto la barra se queda visible: el overlay está
  // anclado a su borde inferior.
  const translated = hidden && !mobileOpen;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-neutral-200/70 bg-white/90 backdrop-blur",
        "transition-transform duration-300 motion-reduce:transition-none",
        translated ? "-translate-y-full" : "translate-y-0",
      )}
    >
      <div className="container-page flex h-16 items-center justify-between">
        <Link
          href="/"
          aria-label="reclu inicio"
          className="shrink-0 rounded-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
        >
          <LogoLockup />
        </Link>

        {/* Desktop nav: seis enlaces; entra en lg para no apretar el header. */}
        <nav
          className="hidden items-center gap-5 lg:flex xl:gap-8"
          aria-label="Principal"
        >
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop: buscar ⌘K, entrar y el CTA */}
        <div className="hidden items-center gap-4 lg:flex xl:gap-6">
          <CommandPalette />
          <Link href="/login" className={linkClass}>
            Entrar
          </Link>
          <ButtonLink
            href="/signup"
            size="sm"
            className="bg-neutral-950 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
          >
            Empezar
          </ButtonLink>
        </div>

        {/* Mobile: buscar + toggle */}
        <div className="flex items-center gap-2 lg:hidden">
          <CommandPalette />
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-sm text-neutral-950 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {/* Mobile nav — pantalla completa blanca, links grandes.
          AnimatePresence: opacidad + y sutil; los links entran escalonados. */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 top-16 z-40 flex flex-col bg-white lg:hidden"
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
                    className="type-section block border-b border-neutral-200/70 py-5 text-neutral-950 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
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
                  className="block border-b border-neutral-200/70 py-5 text-[15px] text-neutral-950 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
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
                className="w-full bg-neutral-950 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
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
