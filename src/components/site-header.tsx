"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { LogoLockup } from "@/components/logo";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#portafolios", label: "Portafolios" },
  { href: "/#precios", label: "Precios" },
  { href: "/explore", label: "Explorar" },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-ink-200/70 bg-white/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" aria-label="reclu.cl inicio" className="shrink-0">
          <LogoLockup />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Principal">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-3 md:flex">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Iniciar sesión
          </ButtonLink>
          <ButtonLink href="/signup" size="sm">
            Comenzar gratis
          </ButtonLink>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile nav */}
      <div
        className={cn(
          "overflow-hidden border-t border-ink-200 bg-white transition-all duration-200 md:hidden",
          mobileOpen ? "max-h-80" : "max-h-0 border-t-0",
        )}
      >
        <nav className="container-page flex flex-col gap-1 py-4" aria-label="Principal móvil">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-ink-200 pt-4">
            <ButtonLink href="/login" variant="outline" size="sm">
              Iniciar sesión
            </ButtonLink>
            <ButtonLink href="/signup" size="sm">
              Comenzar gratis
            </ButtonLink>
          </div>
        </nav>
      </div>
    </header>
  );
}
