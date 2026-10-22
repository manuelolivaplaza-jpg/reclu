import Link from "next/link";
import { LogoLockup } from "@/components/logo";
import { NewsletterSignup } from "@/components/newsletter-signup";

// Evaluado una vez al cargar el módulo — mantiene el prerender determinista.
const CURRENT_YEAR = new Date().getFullYear();

const FOOTER_SECTIONS = [
  {
    title: "Producto",
    links: [
      { href: "/explore", label: "Portafolios" },
      { href: "/#como-funciona", label: "Cómo funciona" },
      { href: "/#precios", label: "Precios" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { href: "/ranking", label: "Ranking" },
      { href: "/aprende", label: "Aprende" },
      { href: "/herramientas", label: "Herramientas" },
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
    <footer className="bg-ink-900 text-white">
      <div className="container-page py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_1.4fr]">
          <div className="flex flex-col gap-4">
            <LogoLockup tone="inverse" />
            <p className="max-w-xs text-sm leading-relaxed text-white/62">
              Seguimiento de portafolios y alertas. Información pública, no es
              asesoría de inversión.
            </p>
          </div>

          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col gap-3">
              <h4 className="text-sm font-medium text-white">{section.title}</h4>
              <ul className="flex flex-col gap-2.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/62 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <NewsletterSignup />
        </div>

        <div className="mt-12 border-t border-white/16 pt-8">
          <h4 className="text-xs font-medium text-white/62">Fuentes de datos</h4>
          <p className="mt-2 text-xs leading-relaxed text-pretty text-white/45">
            House Disclosure · Senate eFD · OGE 278-T · SEC EDGAR (13F, Form 4, 13D, 10-12B, XBRL) · ARK Invest · Global X · iShares · VanEck · Renta 4 · BTG Pactual · BICE · MBI · CMF · Superintendencia de Pensiones · InfoProbidad · Polymarket · Truth Social · X (@elonmusk) · CNBC
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-white/16 pt-8 text-sm md:flex-row md:items-center md:justify-between">
          <p className="text-white/45">© {CURRENT_YEAR} reclu.cl</p>
          <p className="max-w-xl text-xs leading-relaxed text-white/45">
            Información pública con fines informativos. No constituye asesoría de
            inversión. Rentabilidades pasadas no garantizan resultados futuros.
          </p>
        </div>
      </div>
    </footer>
  );
}
