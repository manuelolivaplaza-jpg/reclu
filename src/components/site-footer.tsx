import Link from "next/link";
import { LogoLockup } from "@/components/logo";
import { NewsletterSignup } from "@/components/newsletter-signup";

// Evaluado una vez al cargar el módulo: mantiene el prerender determinista.
const CURRENT_YEAR = new Date().getFullYear();

type FooterLink = { href: string; label: string; external?: boolean };

const FOOTER_SECTIONS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Producto",
    links: [
      { href: "/explore", label: "Portafolios" },
      { href: "/ranking", label: "Ranking" },
      { href: "/#como-funciona", label: "Cómo funciona" },
      { href: "/planes", label: "Precios" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { href: "/aprende", label: "Aprende" },
      { href: "/herramientas", label: "Herramientas" },
      { href: "/metodologia", label: "Metodología" },
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
  {
    title: "Contacto",
    links: [{ href: "mailto:hola@fraccion.si", label: "hola@fraccion.si", external: true }],
  },
];

const linkClass =
  "rounded-sm text-sm text-white/62 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

export function SiteFooter() {
  return (
    <footer className="bg-ink-900 text-white">
      <div className="container-page py-16 md:py-20">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-4 lg:grid-cols-[1.6fr_repeat(4,minmax(0,1fr))] lg:gap-x-10">
          <div className="col-span-2 flex min-w-0 flex-col gap-5 md:col-span-4 lg:col-span-1">
            <LogoLockup tone="inverse" />
            <p className="max-w-xs text-sm leading-relaxed text-white/62">
              Sigue los portafolios de políticos, gestores y fondos con datos
              públicos y alertas cuando cambian.
            </p>
            <div className="max-w-sm">
              <NewsletterSignup />
            </div>
          </div>

          {FOOTER_SECTIONS.map((section) => (
            <nav key={section.title} aria-label={section.title} className="min-w-0">
              <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/45">
                {section.title}
              </h4>
              <ul className="mt-4 flex flex-col gap-3">
                {section.links.map((link) => (
                  <li key={link.href} className="min-w-0 break-words">
                    {link.external ? (
                      <a href={link.href} className={linkClass}>
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={linkClass}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 border-t border-white/10 pt-8">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/45">
            Fuentes de datos
          </h4>
          <p className="mt-3 max-w-4xl text-xs leading-relaxed text-pretty text-white/45">
            House Disclosure · Senate eFD · OGE 278-T · SEC EDGAR (13F, Form 4, 13D, 10-12B, XBRL) · ARK Invest · Global X · iShares · VanEck · Renta 4 · BTG Pactual · BICE · MBI · CMF · Superintendencia de Pensiones · InfoProbidad · Polymarket · Truth Social · X (@elonmusk) · CNBC
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-8 text-xs text-white/45 md:flex-row md:items-center md:justify-between">
          <p>© {CURRENT_YEAR} fraccion.si</p>
          <p className="max-w-xl leading-relaxed md:text-right">
            Información pública con fines informativos. No constituye asesoría de
            inversión. Rentabilidades pasadas no garantizan resultados futuros.
          </p>
        </div>
      </div>
    </footer>
  );
}
