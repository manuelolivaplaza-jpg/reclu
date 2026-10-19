import Link from "next/link";
import {
  LEGAL_NOTICES,
  LEGAL_PAGE_LINKS,
  US_DISCLOSURE_SOURCES,
  type LegalNoticeKind,
} from "@/lib/legal";

/**
 * Descargo de 12px con filete de 1px. Sin iconos y sin color de marca.
 * El texto de /terminos, /privacidad y /disclaimer no se copia: se enlaza.
 */
export function LegalNotice({ kind }: { kind: LegalNoticeKind }) {
  const text = LEGAL_NOTICES[kind];

  return (
    <aside
      aria-label="Aviso legal"
      className="border border-ink-200 px-4 py-3 text-[12px] leading-relaxed text-ink-500"
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
                  className="text-ink-900 underline underline-offset-4"
                >
                  {source.label}
                </a>
              </span>
            ))}
            .
          </>
        ) : null}
      </p>
      <p className="mt-2">
        {LEGAL_PAGE_LINKS.map((link, index) => (
          <span key={link.href}>
            {index > 0 ? " · " : null}
            <Link
              href={link.href}
              className="text-ink-900 underline underline-offset-4"
            >
              {link.label}
            </Link>
          </span>
        ))}
      </p>
    </aside>
  );
}
