"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { LogoLockup } from "@/components/logo";
import { CommandPalette } from "@/components/command-palette-lazy";
import { useHideOnScroll } from "@/lib/use-hide-on-scroll";
import { cn } from "@/lib/utils";

const MobileMenu = dynamic(
  () => import("@/components/site-header-mobile-menu").then((mod) => mod.MobileMenu),
  { ssr: false },
);

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
  const [menuLoaded, setMenuLoaded] = useState(false);
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
          aria-label="Fraccion inicio"
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
            onClick={() => {
              setMenuLoaded(true);
              setMobileOpen((v) => !v);
            }}
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileOpen}
            aria-controls="menu-movil"
          >
            {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {/* d65: el menú móvil (framer-motion + portal) se descarga solo la
          primera vez que se abre; no entra en el JS inicial. */}
      {menuLoaded ? <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} links={NAV_LINKS} /> : null}
    </header>
  );
}
