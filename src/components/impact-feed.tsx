"use client";

import { useEffect, useState } from "react";
import { AI_DISCLAIMER } from "@/lib/ai-disclaimer";
import {
  RELATION_LABEL,
  formatExposure,
  formatNewsDate,
  sourceLabelFor,
  type ImpactFeedEntry,
} from "@/lib/impact-feed";
import {
  requestImpact,
  type ImpactClientResult,
} from "@/lib/impact-client";
import type { ImpactAnalysis } from "@/lib/impact-prompt";

const HORIZON_LABEL: Record<ImpactAnalysis["horizonte"], string> = {
  corto: "Corto plazo",
  medio: "Medio plazo",
  largo: "Largo plazo",
  incierto: "Incierto",
};

const UNCERTAINTY_LABEL: Record<ImpactAnalysis["incertidumbre"], string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

export interface ImpactFeedProps {
  entries: ImpactFeedEntry[];
  /** Plan efectivo, solo para la etiqueta del encabezado. */
  planName: string;
  /** Retraso del plan en horas (24 en Gratis, 0 en Pro/Elite). */
  delayHours: number;
  /** False cuando la cartera aún no tiene posiciones valorizables. */
  hasPositions?: boolean;
}

/**
 * Feed "Noticias que te tocan" (F72).
 *
 * Recibe las filas ya cruzadas por `buildImpactFeed` (server) y solo se ocupa
 * de pintarlas y del panel lateral de análisis. La llamada a la IA vive en
 * `impact-client.ts`: si F71 todavía no existe, el panel muestra un aviso y
 * la noticia sigue enlazada a su fuente.
 */
export function ImpactFeed({
  entries,
  planName,
  delayHours,
  hasPositions = true,
}: ImpactFeedProps) {
  const [panel, setPanel] = useState<{
    entry: ImpactFeedEntry;
    initialRequest: Promise<ImpactClientResult>;
  } | null>(null);

  // La primera consulta se dispara en el clic (no en un efecto): el panel
  // nace con la promesa ya en curso y muestra "Analizando…".
  function openPanel(entry: ImpactFeedEntry) {
    setPanel({
      entry,
      initialRequest: requestImpact({
        newsId: entry.id,
        symbol: entry.primary.symbol,
      }),
    });
  }

  return (
    <section aria-labelledby="impact-feed-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id="impact-feed-title"
            className="text-[22px] font-medium tracking-[-0.03em] text-ink-900"
          >
            Noticias que te tocan
          </h2>
          <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-ink-500">
            Información pública cruzada con tus posiciones por relevancia, sin
            recomendaciones ni órdenes.
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink-500">
          Plan {planName}
        </span>
      </div>

      {delayHours > 0 && (
        <p className="border-t border-ink-200 pt-3 text-[12px] leading-relaxed text-ink-500">
          Tu plan muestra estas noticias {delayHours} h después de su
          publicación.
        </p>
      )}

      {entries.length === 0 ? (
        <p className="border-t border-ink-200 pt-4 text-[14px] leading-relaxed text-ink-500">
          {hasPositions
            ? "Aún no hay noticias recientes que toquen tu cartera. Vuelve a revisar más tarde."
            : "Agrega posiciones a tu cartera para ver qué noticias te tocan."}
        </p>
      ) : (
        <ul className="flex flex-col">
          {entries.map((entry) => (
            <li key={entry.id} className="border-t border-ink-200 py-5 last:border-b">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="max-w-2xl text-[16px] font-medium leading-snug tracking-[-0.01em] text-ink-900 hover:underline"
                >
                  {entry.title}
                </a>
                <span className="shrink-0 text-[13px] tabular-nums text-ink-600">
                  {formatExposure(entry.exposurePct)} de tu cartera
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {entry.matches.map((match) => (
                  <span
                    key={`${match.symbol}-${match.relation}`}
                    className="border border-ink-200 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-ink-600"
                  >
                    {match.symbol} · {RELATION_LABEL[match.relation]} ·{" "}
                    {formatExposure(match.exposurePct)}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
                <span>{sourceLabelFor(entry.source)}</span>
                <span aria-hidden>·</span>
                <time dateTime={entry.publishedAt}>
                  {formatNewsDate(entry.publishedAt)}
                </time>
                <button
                  type="button"
                  onClick={() => openPanel(entry)}
                  className="text-[13px] text-ink-900 underline underline-offset-4 hover:opacity-60"
                >
                  Pregunta a la IA
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {panel && (
        <ImpactPanel
          entry={panel.entry}
          initialRequest={panel.initialRequest}
          onClose={() => setPanel(null)}
        />
      )}
    </section>
  );
}

/** Panel lateral con el análisis del par noticia × ticker. */
function ImpactPanel({
  entry,
  initialRequest,
  onClose,
}: {
  entry: ImpactFeedEntry;
  initialRequest: Promise<ImpactClientResult>;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(true);
  const [result, setResult] = useState<ImpactClientResult | null>(null);

  // La promesa se creó en el clic de "Pregunta a la IA": aquí solo se
  // sincroniza el resultado (setState asíncrono, no en el cuerpo del efecto).
  useEffect(() => {
    let active = true;
    void initialRequest.then((next) => {
      if (!active) return;
      setResult(next);
      setPending(false);
    });
    return () => {
      active = false;
    };
  }, [initialRequest]);

  async function ask(text: string) {
    setPending(true);
    const next = await requestImpact({
      newsId: entry.id,
      symbol: entry.primary.symbol,
      question: text,
    });
    setResult(next);
    setPending(false);
  }

  // Cerrar con Escape, como cualquier diálogo.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="impact-panel-title"
    >
      <button
        type="button"
        aria-label="Cerrar panel"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-900/20"
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-ink-200 bg-white">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-500">
            Análisis con IA
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-ink-900 underline underline-offset-4 hover:opacity-60"
          >
            Cerrar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <h2
            id="impact-panel-title"
            className="text-[18px] font-medium leading-snug tracking-[-0.02em] text-ink-900"
          >
            {entry.title}
          </h2>
          <p className="mt-1.5 text-[12px] text-ink-500">
            {sourceLabelFor(entry.source)} · {formatNewsDate(entry.publishedAt)} ·{" "}
            {entry.primary.symbol}
          </p>

          <div className="mt-5" aria-live="polite">
            {pending && (
              <p className="text-[14px] leading-relaxed text-ink-500">
                Analizando la noticia…
              </p>
            )}
            {!pending && result && <ImpactResult result={result} />}
          </div>

          <form
            className="mt-6 flex flex-col gap-2 border-t border-ink-200 pt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
          >
            <label
              htmlFor="impact-question"
              className="text-[12px] text-ink-500"
            >
              Pregunta libre (opcional)
            </label>
            <input
              id="impact-question"
              type="text"
              value={question}
              maxLength={280}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="¿Qué debería revisar de esta noticia?"
              className="h-11 border border-ink-200 bg-white px-3 text-[14px] text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] leading-relaxed text-ink-500">
                No incluyas datos personales ni montos.
              </span>
              <button
                type="submit"
                disabled={pending}
                className="h-9 shrink-0 rounded-full bg-ink-900 px-4 text-[13px] text-white transition-opacity hover:bg-black disabled:pointer-events-none disabled:opacity-50"
              >
                Preguntar
              </button>
            </div>
          </form>

          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block text-[13px] text-ink-900 underline underline-offset-4 hover:opacity-60"
          >
            Ver la fuente original
          </a>

          <div className="mt-6 border-t border-ink-200 pt-4">
            <p className="text-[10px] uppercase tracking-[0.12em] text-ink-500">
              IA · Información, no recomendación
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-500">
              {AI_DISCLAIMER}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ImpactResult({ result }: { result: ImpactClientResult }) {
  if (result.status !== "ok") {
    return (
      <p className="border-l-2 border-ink-900 pl-3 text-[13px] leading-relaxed text-ink-600">
        {result.message}
      </p>
    );
  }

  const analysis = result.analysis;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed text-ink-900">
        {analysis.resumen}
      </p>

      <dl className="grid gap-3 border-t border-ink-200 pt-4 text-[13px]">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-500">
            Canal de impacto
          </dt>
          <dd className="mt-0.5 text-ink-900">{analysis.canal_de_impacto}</dd>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-500">
              Horizonte
            </dt>
            <dd className="mt-0.5 text-ink-900">
              {HORIZON_LABEL[analysis.horizonte]}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-500">
              Incertidumbre
            </dt>
            <dd className="mt-0.5 text-ink-900">
              {UNCERTAINTY_LABEL[analysis.incertidumbre]}
            </dd>
          </div>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-500">
            Qué mirar
          </dt>
          <dd className="mt-0.5 text-ink-900">{analysis.que_mirar}</dd>
        </div>
      </dl>

      {/* `direccion_posible` no se muestra: el informe legal §A2 pide no
          asociar una dirección positiva/negativa a la cartera del usuario. */}
      <p className="text-[11px] leading-relaxed text-ink-500">
        {result.cached
          ? "Análisis genérico cacheado para esta noticia y ticker."
          : "Análisis generado para esta noticia y ticker."}
      </p>
    </div>
  );
}
