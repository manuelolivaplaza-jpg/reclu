import Link from "next/link";
import { DemoBadge } from "@/components/demo-badge";
import {
  formatMentionDate,
  mentionKindLabel,
  recluActionLabel,
  shortQuote,
  type MentionsList,
  type PublicMention,
} from "@/lib/mentions-queries";

/**
 * Lista de menciones verificadas. Trump dice, Elon Musk dice e Inverse
 * Cramer comparten `public.mentions`. La consulta arranca en la página
 * para no esperar al resto de los datos. `notice` es el aviso de empresas
 * propias (F11). `variant="cramer"` muestra el Lightning Round.
 */
export async function TrumpMentionsList({
  mentions,
  notice,
  metodologiaHref = "/metodologia#trump-dice",
  variant = "trump",
}: {
  mentions: Promise<MentionsList>;
  notice?: string;
  metodologiaHref?: string;
  variant?: "trump" | "cramer";
}) {
  const data = await mentions;
  if (variant === "cramer") return <CramerMentions data={data} />;

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
          href={metodologiaHref}
          className="font-medium text-ink-900 underline underline-offset-4"
        >
          Cómo se calcula
        </Link>
      </p>
      {notice ? (
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-600">{notice}</p>
      ) : null}
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

function CramerMentions({ data }: { data: MentionsList }) {
  return (
    <section className="mb-12" aria-labelledby="cramer-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="cramer-titulo" className="text-[15px] font-medium text-ink-900">
          Lightning Round{data.mentions.length > 0 ? ` (${data.mentions.length})` : ""}
        </h2>
        {data.isDemo ? <DemoBadge /> : null}
      </div>
      <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-600">
        Simulación histórica con fines informativos. No es recomendación de inversión.
        Los cortos no descuentan el costo de pedir prestadas las acciones. El ETF SJIM
        (Inverse Cramer, de Tuttle) operó del 2023-03-01 al 2024-02-23 y se liquidó con
        un NAV de US$19,78 contra US$25 al lanzamiento. Irle a Cramer no fue un negocio
        sostenido. En el corte del 2026-10-16 el inverso de 25 picks con precio rindió
        +0,07% contra −0,44% del SPY. La muestra es chica y no permite concluir nada.
      </p>
      {data.mentions.length === 0 ? (
        <p className="mt-4 text-[15px] text-ink-500">Sin menciones verificadas todavía.</p>
      ) : (
        <div className="mt-4 border-t border-ink-200">
          <div className="hidden grid-cols-2 gap-8 border-b border-ink-200 py-2 text-[13px] text-ink-500 sm:grid">
            <span>Cramer dijo</span>
            <span>Reclu hace</span>
          </div>
          <ul>
            {data.mentions.map((mention) => (
              <CramerRow key={mention.id} mention={mention} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CramerRow({ mention }: { mention: PublicMention }) {
  const action = recluActionLabel(mention.kind, mention.symbol);
  return (
    <li className="grid gap-3 border-b border-ink-200 py-4 sm:grid-cols-2 sm:gap-8">
      <div>
        <p className="text-[13px] text-ink-500 sm:hidden">Cramer dijo</p>
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
          <span className="text-[13px] text-ink-500">{mentionKindLabel(mention.kind)}</span>
        </div>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-900">{shortQuote(mention.quote, 80)}</p>
        <a
          href={mention.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[13px] font-medium text-ink-900 underline underline-offset-4"
        >
          Fuente
          <span className="sr-only"> (se abre en una pestaña nueva)</span>
        </a>
      </div>
      <div className="border-t border-ink-200 pt-3 sm:border-t-0 sm:pt-0">
        <p className="text-[13px] text-ink-500 sm:hidden">Reclu hace</p>
        <p className="text-[15px] font-medium text-ink-900">{action ?? "Sin posición"}</p>
      </div>
    </li>
  );
}
