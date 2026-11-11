"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface SettingsSection {
  /** Ancla (#cuenta) o ruta (/settings/api). */
  href: string;
  label: string;
  /** Texto secundario de la sección. */
  hint?: string;
}

export const DEFAULT_SETTINGS_SECTIONS: SettingsSection[] = [
  { href: "#cuenta", label: "Cuenta", hint: "Nombre y correo" },
  { href: "#plan", label: "Plan", hint: "Suscripción y facturación" },
  { href: "#notificaciones", label: "Notificaciones", hint: "Correo y frecuencia" },
  { href: "#telegram", label: "Telegram", hint: "Alertas en tu chat" },
  { href: "/settings/api", label: "API", hint: "Claves de acceso" },
  { href: "#referidos", label: "Referidos", hint: "Invita y gana" },
];

/**
 * Subnavegación de Ajustes (P5): riel lateral adhesivo en escritorio y tira
 * horizontal deslizable en móvil. Solo strings como props (sin íconos ni
 * funciones desde el servidor). Las anclas marcan la sección visible.
 */
export function SettingsSubnav({
  sections = DEFAULT_SETTINGS_SECTIONS,
}: {
  sections?: SettingsSection[];
}) {
  const pathname = usePathname();
  const [hash, setHash] = useState(sections[0]?.href ?? "");

  useEffect(() => {
    const anchors = sections.filter((s) => s.href.startsWith("#"));
    const els = anchors
      .map((s) => document.getElementById(s.href.slice(1)))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setHash(`#${top.target.id}`);
      },
      { rootMargin: "-100px 0px -60% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  const isActive = (href: string) =>
    href.startsWith("#") ? pathname === "/settings" && hash === href : pathname.startsWith(href);

  // Desde otra ruta de Ajustes, un ancla vuelve a /settings con la sección.
  const hrefFor = (href: string) =>
    href.startsWith("#") && pathname !== "/settings" ? `/settings${href}` : href;

  return (
    <>
      {/* Escritorio: riel adhesivo con indicador vertical de 2px */}
      <nav aria-label="Secciones de ajustes" className="hidden lg:block">
        <div className="sticky top-20">
          <p className="pl-4 text-[12px] leading-none text-ink-500">En esta página</p>
          <ul className="mt-3 flex flex-col border-t border-ink-200">
            {sections.map((s) => {
              const active = isActive(s.href);
              return (
                <li key={s.href} className="border-b border-ink-200">
                  <Link
                    href={hrefFor(s.href)}
                    onClick={() => s.href.startsWith("#") && setHash(s.href)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center border-l-2 pl-4 pr-3 text-[14px] transition-colors",
                      active
                        ? "border-ink-900 font-medium text-ink-900"
                        : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-900",
                    )}
                  >
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Móvil: tira horizontal deslizable, sin barra visible */}
      <nav aria-label="Secciones de ajustes" className="lg:hidden">
        <div className="overflow-x-auto no-scrollbar border-b border-ink-200">
          <ul className="-ml-3 flex w-max min-w-full items-stretch">
            {sections.map((s) => {
              const active = isActive(s.href);
              return (
                <li key={s.href}>
                  <Link
                    href={hrefFor(s.href)}
                    onClick={() => s.href.startsWith("#") && setHash(s.href)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-11 items-center whitespace-nowrap px-3 text-[14px] transition-colors",
                      active
                        ? "font-medium text-ink-900"
                        : "text-ink-500 hover:text-ink-900 active:text-ink-900",
                    )}
                  >
                    {s.label}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-x-3 bottom-0 h-0.5",
                        active ? "bg-ink-900" : "bg-transparent",
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </>
  );
}
