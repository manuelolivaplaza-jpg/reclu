import Link from "next/link";
import { DemoBadge } from "@/components/demo-badge";
import {
  formatMentionDate,
  mentionKindLabel,
  shortQuote,
  type MentionsList,
  type PublicMention,
} from "@/lib/mentions-queries";

/**
 * Lista de menciones verificadas. Solo se monta si el portafolio tiene
 * source trump_mentions. La consulta arranca en la página para no esperar
 * al resto de los datos.
 */
export async function TrumpMentionsList({
  mentions,
}: {
  mentions: Promise<MentionsList>;
}) {
  const data = await mentions;

  return (
    <section className="mb-12" aria-labelledby="menciones-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="menciones-titulo" className="text-[15px] font-medium text-ink-900">
          Menciones{data.mentions.length > 0 ? ` (${data.mentions.length})` : ""}
        </h2>
        {data.isDemo ? <DemoBadge /> : null}
      </div>
      <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-600">
        Simulación histórica con fines informativos. No es recomendación de inversión.{" "}
        <Link
          href="/metodologia#trump-dice"
          className="font-medium text-ink-900 underline underline-offset-4"
        >
          Cómo se calcula
        </Link>
      </p>
      {data.mentions.length === 0 ? (
        <p className="mt-4 text-[15px] text-ink-500">Sin menciones verificadas todavía.</p>
      ) : (
        <ul className="mt-4 border-t border-ink-200">
          {data.mentions.map((mention) => (
            <MentionRowView key={mention.id} mention={mention} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MentionRowView({ mention }: { mention: PublicMention }) {
  return (
    <li className="border-b border-ink-200 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <time dateTime={mention.saidAt} className="num text-[13px] text-ink-500">
          {formatMentionDate(mention.saidAt)}
        </time>
        <Link
          href={`/accion/${encodeURIComponent(mention.symbol.toLowerCase())}`}
          className="font-medium text-ink-900 underline-offset-4 hover:underline"
        >
          {mention.symbol}
        </Link>
        {mention.company ? (
          <span className="text-[13px] text-ink-500">{mention.company}</span>
        ) : null}
        <span className="text-[13px] text-ink-500">{mentionKindLabel(mention.kind)}</span>
      </div>
      <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-900">
        {shortQuote(mention.quote)}
      </p>
      <a
        href={mention.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-[13px] font-medium text-ink-900 underline underline-offset-4"
      >
        Fuente
        <span className="sr-only"> (se abre en una pestaña nueva)</span>
      </a>
    </li>
  );
}
