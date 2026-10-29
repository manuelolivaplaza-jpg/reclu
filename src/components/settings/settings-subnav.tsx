"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface SettingsSection {
  /** Ancla (#cuenta) o ruta (/settings/api). */
  href: string;
  label: string;
  /** Texto secundario en la lista móvil. */
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
 * Subnavegación de Ajustes (P5): pestañas en escritorio y lista estilo iOS
 * en móvil. Solo strings como props (sin íconos ni funciones desde el
 * servidor). Las anclas marcan la sección visible.
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

  return (
    <>
      {/* Escritorio: pestañas */}
      <nav aria-label="Secciones de ajustes" className="hidden border-b border-ink-200 md:block">
        <ul className="flex gap-6">
          {sections.map((s) => {
            const active = isActive(s.href);
            const href = s.href.startsWith("#") && pathname !== "/settings" ? `/settings${s.href}` : s.href;
            return (
              <li key={s.href}>
                <Link
                  href={href}
                  onClick={() => s.href.startsWith("#") && setHash(s.href)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-11 items-center text-[14px] font-medium transition-colors",
                    active ? "text-ink-900" : "text-ink-500 hover:text-ink-900",
                  )}
                >
                  {s.label}
                  <span
                    aria-hidden="true"
                    className={cn("absolute inset-x-0 -bottom-px h-0.5 rounded-full", active ? "bg-ink-900" : "bg-transparent")}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Móvil: lista agrupada estilo iOS */}
      <nav aria-label="Secciones de ajustes" className="md:hidden">
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white">
          {sections.map((s) => {
            const href = s.href.startsWith("#") && pathname !== "/settings" ? `/settings${s.href}` : s.href;
            return (
              <li key={s.href}>
                <Link
                  href={href}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 active:bg-ink-50"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium text-ink-900">{s.label}</span>
                    {s.hint ? <span className="block truncate text-[12px] text-ink-500">{s.hint}</span> : null}
                  </span>
                  <span aria-hidden="true" className="text-[18px] leading-none text-ink-400">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
