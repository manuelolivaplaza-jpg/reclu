"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
 * Subnavegación de Ajustes: riel adhesivo en escritorio y tira horizontal
 * deslizable en móvil. El enlace activo se marca con `aria-current`
 * ("page" en rutas, "location" dentro de la misma página). Solo strings y
 * booleanos desde el servidor (nada de íconos ni funciones).
 */
export function SettingsSubnav({
  sections = DEFAULT_SETTINGS_SECTIONS,
  showReferrals = true,
}: {
  sections?: SettingsSection[];
  showReferrals?: boolean;
}) {
  const pathname = usePathname() ?? "";
  // La lista se filtra aquí (módulo cliente): el servidor no importa datos
  // desde un módulo de cliente, solo pasa booleanos.
  const items = useMemo(
    () => (showReferrals ? sections : sections.filter((s) => s.href !== "#referidos")),
    [sections, showReferrals],
  );
  const [hash, setHash] = useState(items[0]?.href ?? "");

  // Enlace directo (/settings#plan): la URL manda sobre la sección inicial.
  // Se escucha `hashchange` (sistema externo) y se sincroniza una vez al
  // montar; nunca se llama setState dentro del cuerpo del efecto.
  useEffect(() => {
    const sync = () => setHash(window.location.hash || items[0]?.href || "");
    window.addEventListener("hashchange", sync);
    const id = window.setTimeout(sync, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("hashchange", sync);
    };
  }, [items]);

  // Marca la sección visible mientras se hace scroll dentro de Ajustes.
  useEffect(() => {
    const anchors = items.filter((s) => s.href.startsWith("#"));
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
  }, [items]);

  const isActive = (href: string) =>
    href.startsWith("#")
      ? pathname === "/settings" && hash === href
      : pathname === href || pathname.startsWith(`${href}/`);

  // Desde otra ruta de Ajustes, un ancla vuelve a /settings con la sección.
  const hrefFor = (href: string) =>
    href.startsWith("#") && pathname !== "/settings" ? `/settings${href}` : href;

  const currentFor = (href: string) =>
    isActive(href) ? (href.startsWith("#") ? "location" : "page") : undefined;

  return (
    <>
      {/* Escritorio: riel adhesivo con indicador vertical de 2px */}
      <nav aria-label="Secciones de ajustes" className="hidden lg:block">
        <div className="sticky top-20">
          <p className="label-line pl-4">
            {pathname === "/settings" ? "En esta página" : "Ajustes"}
          </p>
          <ul className="mt-3 flex flex-col border-t border-line">
            {items.map((s) => {
              const active = isActive(s.href);
              return (
                <li key={s.href} className="border-b border-line">
                  <Link
                    href={hrefFor(s.href)}
                    onClick={() => s.href.startsWith("#") && setHash(s.href)}
                    aria-current={currentFor(s.href)}
                    className={cn(
                      "flex min-h-11 items-center border-l-2 pl-4 pr-3 text-[14px] leading-snug transition-colors",
                      "focus-visible:outline-offset-[-2px]",
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
        <div className="overflow-x-auto overscroll-x-contain no-scrollbar border-b border-line">
          <ul className="flex w-max min-w-full items-stretch">
            {items.map((s, index) => {
              const active = isActive(s.href);
              const first = index === 0;
              return (
                <li key={s.href} className="flex">
                  <Link
                    href={hrefFor(s.href)}
                    onClick={() => s.href.startsWith("#") && setHash(s.href)}
                    aria-current={currentFor(s.href)}
                    className={cn(
                      "relative flex min-h-11 items-center whitespace-nowrap text-[14px] transition-colors",
                      "focus-visible:outline-offset-[-2px]",
                      first ? "pl-0 pr-3" : "px-3",
                      active
                        ? "font-medium text-ink-900"
                        : "text-ink-500 hover:text-ink-900 active:text-ink-900",
                    )}
                  >
                    {s.label}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute bottom-0 h-0.5",
                        first ? "left-0 right-3" : "inset-x-3",
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
