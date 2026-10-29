"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, LazyMotion, m, useReducedMotion } from "framer-motion";
import { loadMotionFeatures } from "@/lib/load-motion-features";
import { Menu, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { LogoLockup } from "@/components/logo";
import { CommandPalette } from "@/components/command-palette-lazy";
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  // Con el menú móvil abierto la barra se queda visible: el overlay está
  // anclado a su borde inferior.
  const translated = hidden && !mobileOpen;
  // El overlay va en un portal a <body>: el header usa backdrop-blur y
  // transform, que crean un containing block y dejaban el panel "fixed"
  // atrapado (transparente) sobre el hero.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

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
            aria-controls="menu-movil"
          >
            {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {/* Mobile nav — pantalla completa blanca, links grandes.
          AnimatePresence: opacidad + y sutil; los links entran escalonados. */}
      {mounted && createPortal(
      <LazyMotion features={loadMotionFeatures}>
      <AnimatePresence>
        {mobileOpen && (
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
                onClick={() => setMobileOpen(false)}
                className="rounded-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
              >
                <LogoLockup />
              </Link>
              <button
                type="button"
                autoFocus
                onClick={() => setMobileOpen(false)}
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
              {NAV_LINKS.map((link) => (
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
                    onClick={() => setMobileOpen(false)}
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
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-12 w-full items-center justify-center rounded-full border border-neutral-200 text-[15px] font-medium text-neutral-950 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
              >
                Entrar
              </Link>
              <ButtonLink
                href="/signup"
                size="lg"
                className="w-full rounded-full bg-neutral-950 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
                onClick={() => setMobileOpen(false)}
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
    </header>
  );
}
