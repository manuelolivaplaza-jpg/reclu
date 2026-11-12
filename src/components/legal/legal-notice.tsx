import Link from "next/link";
import {
  LEGAL_NOTICES,
  LEGAL_PAGE_LINKS,
  US_DISCLOSURE_SOURCES,
  type LegalNoticeKind,
} from "@/lib/legal";

const LINK =
  "text-ink-900 underline decoration-ink-300 decoration-1 underline-offset-4 transition-colors hover:decoration-ink-900 dark:text-white dark:decoration-white/40 dark:hover:decoration-white";

/**
 * Descargo con filete de 1px. Sin iconos y sin color de marca.
 * El texto de /terminos, /privacidad y /disclaimer no se copia: se enlaza.
 */
export function LegalNotice({ kind }: { kind: LegalNoticeKind }) {
  const text = LEGAL_NOTICES[kind];

  return (
    <aside
      aria-label="Aviso legal"
      className="border border-ink-200 px-4 py-3 text-[13px] leading-[1.6] text-ink-500 dark:border-white/12 dark:text-ink-400 print:break-inside-avoid print:text-black"
    >
      <p>
        {text}
        {kind === "us_disclosure" ? (
          <>
            {" "}
            Fuente oficial:{" "}
            {US_DISCLOSURE_SOURCES.map((source, index) => (
              <span key={source.href}>
                {index > 0 ? " · " : null}
                <a
                  href={source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK}
                >
                  {source.label}
                  <span className="ml-0.5 inline-block text-[0.9em]" aria-hidden>↗</span>
                  <span className="sr-only"> (abre en una pestaña nueva)</span>
                </a>
              </span>
            ))}
            .
          </>
        ) : null}
      </p>
      <p className="mt-2.5">
        {LEGAL_PAGE_LINKS.map((link, index) => (
          <span key={link.href}>
            {index > 0 ? " · " : null}
            <Link href={link.href} className={LINK}>
              {link.label}
            </Link>
          </span>
        ))}
      </p>
    </aside>
  );
}
