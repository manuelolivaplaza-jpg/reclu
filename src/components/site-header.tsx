"use client";

import { useState } from "react";
import Link from "next/link";
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

      {/* Mobile nav — pantalla completa blanca, links grandes */}
      {mobileOpen && (
        <div className="fixed inset-0 top-16 z-40 flex flex-col bg-white md:hidden">
          <nav className="container-page flex flex-1 flex-col gap-2 pt-8" aria-label="Principal móvil">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="type-section border-b border-ink-200 py-5 text-ink-900"
                style={{ fontSize: "clamp(1.75rem, 8vw, 2rem)" }}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="border-b border-ink-200 py-5 text-[15px] text-ink-900"
            >
              Entrar
            </Link>
          </nav>
          <div className="container-page pb-10">
            <ButtonLink
              href="/signup"
              size="lg"
              className="w-full"
              onClick={() => setMobileOpen(false)}
            >
              Empezar
            </ButtonLink>
          </div>
        </div>
      )}
    </header>
  );
}
