import Link from "next/link";
import { LogoLockup } from "@/components/logo";

// Evaluated once at module load — keeps prerendering deterministic.
const CURRENT_YEAR = new Date().getFullYear();

const FOOTER_SECTIONS = [
  {
    title: "Producto",
    links: [
      { href: "/explore", label: "Explorar portafolios" },
      { href: "/#precios", label: "Precios" },
      { href: "/#como-funciona", label: "Cómo funciona" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { href: "/#portafolios", label: "Fuentes de datos" },
      { href: "/#faq", label: "Preguntas frecuentes" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terminos", label: "Términos" },
      { href: "/privacidad", label: "Privacidad" },
      { href: "/disclaimer", label: "Disclaimer" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-200 bg-surface">
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <LogoLockup />
            <p className="max-w-xs text-sm leading-relaxed text-ink-600">
              Seguimiento de portafolios y alertas inteligentes para inversores en
              Chile y Latinoamérica.
            </p>
          </div>

          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-ink-900">{section.title}</h4>
              <ul className="flex flex-col gap-2.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-600 transition-colors hover:text-ink-900"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-ink-200 pt-8 text-sm text-ink-500 md:flex-row md:items-center md:justify-between">
          <p>© {CURRENT_YEAR} reclu.cl — Todos los derechos reservados.</p>
          <p className="max-w-xl text-xs leading-relaxed text-ink-500">
            Información pública con fines informativos. No constituye asesoría de
            inversión. Rentabilidades pasadas no garantizan resultados futuros.
          </p>
        </div>
      </div>
    </footer>
  );
}
