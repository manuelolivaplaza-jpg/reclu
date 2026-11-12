import Link from "next/link";
import { formatDecimal, formatPctPlain } from "@/lib/utils";

/**
 * d80 · Función nueva 2 — Radiografía de concentración y movimientos.
 *
 * Bloque editorial que se monta en la ficha de portafolio (pública y dentro de
 * la app) SOLO con datos que el servidor ya recortó según el rol: este
 * componente no decide accesos ni lee nada. Si la lista viene vacía o sin
 * pesos ni cambios, no renderiza nada (el muro lo resuelve el llamador).
 *
 * Tres lecturas, en un solo bloque de filetes de 1px:
 *  1) Cuánto pesa la mayor posición y el Top 3 / Top 5, con barra monocroma
 *     segmentada y una etiqueta honesta de concentración.
 *  2) Mayores alzas y recortes de peso del último corte, con enlace a /accion/.
 *  3) Cómo leer la fuente (rezago legal o cadencia de publicación).
 *
 * Estilo: blanco y negro, radio 0, cero sombras. Verde/rojo solo en las cifras
 * de variación de peso.
 */

export interface XrayHolding {
  symbol: string;
  /** Etiqueta corta ya truncada para mostrar (displaySymbol). */
  displaySymbol?: string | null;
  name?: string | null;
  /** Peso en el portafolio, 0–100. */
  weight: number;
  /** Peso en el corte anterior; ausente o null si la fuente no lo publica. */
  previous_weight?: number | null;
}

export interface PortfolioXrayProps {
  /** Filas YA recortadas por el rol (top visible del plan). */
  holdingsTable: readonly XrayHolding[];
  /** Fuente del portafolio, para la nota de lectura. */
  source?: string | null;
  /** Hay al menos un peso real (> 0) que mostrar. */
  hasWeightData: boolean;
  /** Hay al menos un corte anterior con el que comparar. */
  hasChangeData: boolean;
  /** La lista visible es un top recortado por el plan. */
  isPartialTop?: boolean;
  /** Cuántas posiciones ve este rol (para decir el alcance con honestidad). */
  totalVisible?: number;
}

/** Escala de negros para los tramos de la barra (máximo 5 posiciones). */
const SEGMENT_TONES = [
  "bg-ink-900",
  "bg-ink-700",
  "bg-ink-500",
  "bg-ink-400",
  "bg-ink-300",
] as const;

function tickerOf(holding: XrayHolding): string {
  const display = (holding.displaySymbol ?? "").trim();
  return display.length > 0 ? display : String(holding.symbol ?? "").trim();
}

function cleanName(holding: XrayHolding): string {
  const name = String(holding.name ?? "").trim();
  if (!name) return "";
  return name.toUpperCase() === String(holding.symbol ?? "").toUpperCase() ? "" : name;
}

function actionHref(symbol: string): string {
  return `/accion/${encodeURIComponent(String(symbol).toLowerCase())}`;
}

interface WeightMove {
  holding: XrayHolding;
  /** Variación en puntos porcentuales, redondeada a 0,1. */
  delta: number;
}

/**
 * Cambios de peso distintos de cero, redondeados a 0,1 pp. Un delta que
 * redondea a 0,0 no es un movimiento: se descarta (nunca "0,0 pp" de relleno).
 */
function weightMoves(rows: readonly XrayHolding[]): WeightMove[] {
  const moves: WeightMove[] = [];
  for (const holding of rows) {
    const previous = holding.previous_weight;
    if (previous === null || previous === undefined || !Number.isFinite(previous)) continue;
    const weight = Number(holding.weight);
    if (!Number.isFinite(weight)) continue;
    const delta = Math.round((weight - previous) * 10) / 10;
    if (delta === 0) continue;
    moves.push({ holding, delta });
  }
  return moves;
}

function concentrationReading(
  topShare: number,
  topFiveShare: number | null,
): { label: string; detail: string } {
  // Se mira la mayor posición y el top 5: un libro con 18% arriba pero 80% en
  // cinco nombres sigue siendo concentrado. Con menos de cinco activos, el
  // top 5 es la suma disponible (null) y manda solo la mayor posición.
  const five = topFiveShare ?? topShare;
  const high = topShare >= 35 || five >= 75;
  const medium = topShare >= 15 || five >= 50;
  if (high) {
    return {
      label: "Alta concentración",
      detail:
        "Pocas posiciones explican la mayor parte del peso visible: el resultado de la cartera depende de esas ideas.",
    };
  }
  if (medium) {
    return {
      label: "Concentración media",
      detail:
        "El peso se reparte entre varias posiciones, aunque las principales todavía inclinan el resultado.",
    };
  }
  return {
    label: "Diversificada",
    detail:
      "Ninguna posición domina el peso visible: el resultado se reparte entre muchas ideas y ninguna manda.",
  };
}

/** Nota de lectura según la fuente: rezago legal o cadencia de publicación. */
export function xraySourceNote(source: string | null | undefined): string {
  switch (String(source ?? "").trim()) {
    case "sec_13f":
    case "sec13f":
      return "Reporte trimestral 13F ante la SEC: se publica hasta 45 días después del cierre de cada trimestre, así que el libro pudo cambiar desde esa fecha.";
    case "house_ptr":
    case "senate_ptr":
    case "house_disclosure":
    case "senate_disclosure":
    case "house_clerk":
    case "congress_invests":
    case "capitol_trades":
      return "Declaración de operaciones del Congreso de EE.UU. (PTR): la ley permite divulgar hasta 45 días después de la operación.";
    case "oge_278t":
      return "Formulario OGE 278-T del Poder Ejecutivo de EE.UU.: se declara dentro de los 30 días siguientes, con montos por tramos y no exactos.";
    case "sec_form4":
      return "Formulario 4 de la SEC: los insiders lo presentan dentro de dos días hábiles desde la operación.";
    case "renta4":
    case "btg":
    case "larrainvial":
    case "corredoras_cl":
    case "bice_cartera":
    case "mbi_cartera":
      return "Cartera recomendada publicada por la corredora en su sitio público: se actualiza de forma periódica, no en tiempo real.";
    case "pricing":
    case "etf":
    case "nport":
      return "Tenencias reportadas por el emisor del ETF según su calendario de publicación: no cambian todos los días.";
    case "spensiones":
    case "afp_modelo":
      return "Cartera informada por la Superintendencia de Pensiones: llega con desfase entre la fecha de cartera y su publicación.";
    case "infoprobidad":
      return "Declaraciones de intereses de autoridades chilenas (InfoProbidad): se actualizan cuando cada institución publica su nómina.";
    case "model":
    case "reclu":
    case "manual":
      return "Cartera modelo de Fraccion: los pesos se revisan cuando cambia la tesis, no todos los días.";
    case "trump_mentions":
    case "musk_mentions":
    case "public_mentions":
    case "truth_social":
    case "cnbc_lightning_round":
    case "inverse_cramer":
      return "Seguimiento de menciones públicas: la fecha es la de la declaración, no la de una operación de mercado.";
    case "polymarket":
      return "Contratos de predicción de Polymarket: los pesos se mueven con el mercado del evento, no con una cartera real.";
    default:
      return "Información pública con su propio calendario de actualización: puede llegar con rezago respecto del mercado.";
  }
}

export function PortfolioXray({
  holdingsTable,
  source,
  hasWeightData,
  hasChangeData,
  isPartialTop = false,
  totalVisible,
}: PortfolioXrayProps) {
  const rows = (holdingsTable ?? []).filter(
    (h) => h && String(h.symbol ?? "").trim().length > 0,
  );
  // Sin filas no hay radiografía. El llamador ya filtra el muro, esto es red de seguridad.
  if (rows.length === 0) return null;
  if (!hasWeightData && !hasChangeData) return null;

  const weighted = rows
    .filter((h) => Number.isFinite(h.weight) && h.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const visibleWeight = weighted.reduce((sum, h) => sum + h.weight, 0);
  const top1 = weighted[0] ?? null;
  const top3 =
    weighted.length >= 3
      ? weighted.slice(0, 3).reduce((sum, h) => sum + h.weight, 0)
      : null;
  const top5 =
    weighted.length >= 5
      ? weighted.slice(0, 5).reduce((sum, h) => sum + h.weight, 0)
      : null;
  const reading = top1 ? concentrationReading(top1.weight, top5) : null;
  const segments = weighted.slice(0, 5).map((holding, index) => ({
    holding,
    weight: holding.weight,
    tone: SEGMENT_TONES[index] ?? "bg-ink-300",
  }));
  const remainder =
    hasWeightData && visibleWeight < 99.5 ? Math.max(0, 100 - visibleWeight) : 0;

  const moves = hasChangeData ? weightMoves(rows) : [];
  const ups = moves.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const downs = moves.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
  const hasMoves = ups.length > 0 || downs.length > 0;
  const visibleCount = totalVisible ?? rows.length;

  return (
    <section
      id="radiografia"
      aria-label="Radiografía de concentración y movimientos"
      className="mb-12 scroll-mt-28 rounded-none border border-ink-200 bg-white p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink-200 pb-3">
        <h2 className="text-[15px] font-medium text-ink-900">Radiografía</h2>
        <p className="text-[12px] text-ink-500">Concentración y movimientos del último corte</p>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* 1) Concentración visible */}
        <div className="min-w-0">
          <p className="label-line">Concentración visible</p>

          {hasWeightData && top1 && reading ? (
            <>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="num text-[2rem] leading-none tracking-[-0.03em] text-ink-900">
                  {formatPctPlain(top1.weight, 1)}
                </span>
                <span className="text-[13px] leading-snug text-ink-500">
                  en {tickerOf(top1)} · mayor posición
                  {isPartialTop ? " visible" : ""}
                </span>
              </div>

              {/* Barra monocroma: un tramo por posición visible (máx. 5). */}
              <div className="mt-4" aria-hidden="true">
                <div className="flex h-2.5 w-full overflow-hidden bg-ink-100">
                  {segments.map((segment, index) => (
                    <span
                      key={`${segment.holding.symbol}-${index}`}
                      style={{ width: `${Math.min(100, Math.max(0, segment.weight))}%`, minWidth: "2px" }}
                      className={segment.tone}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-500">
                  Cada tramo es una posición visible, de mayor a menor peso.
                  {remainder >= 0.5
                    ? " El tramo claro es lo que la fuente no declara o queda fuera de la vista."
                    : ""}
                </p>
              </div>

              <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
                <span className="font-medium text-ink-900">{reading.label}.</span>{" "}
                {reading.detail}
                {isPartialTop
                  ? ` Medido solo sobre las ${visibleCount} posiciones visibles de tu plan: la cartera completa puede estar más o menos concentrada.`
                  : ""}
                {!isPartialTop && visibleWeight < 99.5
                  ? ` Las ${weighted.length} posiciones visibles suman ${formatPctPlain(visibleWeight, 0)} del portafolio.`
                  : ""}
              </p>

              {top3 !== null || top5 !== null ? (
                <div
                  className={
                    "mt-5 grid gap-px border border-ink-200 bg-ink-200 " +
                    (top3 !== null && top5 !== null ? "grid-cols-2" : "grid-cols-1")
                  }
                >
                  {top3 !== null ? (
                    <div className="bg-white p-3.5">
                      <p className="text-[12px] text-ink-500">Top 3 acumulado</p>
                      <p className="num mt-1 text-[17px] leading-none text-ink-900">
                        {formatPctPlain(top3, 1)}
                      </p>
                    </div>
                  ) : null}
                  {top5 !== null ? (
                    <div className="bg-white p-3.5">
                      <p className="text-[12px] text-ink-500">Top 5 acumulado</p>
                      <p className="num mt-1 text-[17px] leading-none text-ink-900">
                        {formatPctPlain(top5, 1)}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-5 text-[13px] leading-relaxed text-ink-500">
                  La cartera visible tiene {weighted.length}{" "}
                  {weighted.length === 1 ? "posición" : "posiciones"}: no alcanza para
                  medir un Top 3.
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
              La fuente no entrega un peso por posición en este corte, así que no
              hay concentración que medir. Los movimientos se muestran igual, con
              los datos reales del último corte.
            </p>
          )}
        </div>

        {/* 2) Movimientos del último corte */}
        <div className="min-w-0">
          <p className="label-line">Movimientos del último corte</p>

          {hasMoves ? (
            <div className="mt-3 grid gap-6 sm:grid-cols-2">
              {ups.length > 0 ? (
                <div>
                  <p className="text-[12px] text-ink-500">Mayores alzas de peso</p>
                  <ul className="mt-1 border-t border-ink-200">
                    {ups.map((move) => (
                      <li key={`up-${move.holding.symbol}`} className="border-b border-ink-200">
                        <MoveRow move={move} tone="text-positive" />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {downs.length > 0 ? (
                <div>
                  <p className="text-[12px] text-ink-500">Mayores recortes de peso</p>
                  <ul className="mt-1 border-t border-ink-200">
                    {downs.map((move) => (
                      <li key={`down-${move.holding.symbol}`} className="border-b border-ink-200">
                        <MoveRow move={move} tone="text-negative" />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : hasChangeData ? (
            <div className="mt-3 border-t border-ink-200 pt-3">
              <p className="text-[15px] leading-snug text-ink-900">
                Sin variaciones de peso en este corte.
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
                Los pesos se mantuvieron iguales respecto del corte anterior. La
                próxima actualización de la fuente puede moverlos.
              </p>
            </div>
          ) : (
            <div className="mt-3 border-t border-ink-200 pt-3">
              <p className="text-[15px] leading-snug text-ink-900">
                Aún no hay un corte anterior con el que comparar.
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
                En cuanto la fuente publique una segunda fotografía de la cartera,
                acá aparecerán las mayores alzas y recortes de peso.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 3) Cómo leer esta fuente */}
      <p className="mt-8 border-t border-ink-200 pt-4 text-[12px] leading-relaxed text-ink-500">
        <span className="font-medium text-ink-900">Cómo leer esta fuente.</span>{" "}
        {xraySourceNote(source)} Información pública con fines informativos: no es
        asesoría de inversión.
      </p>
    </section>
  );
}

function MoveRow({
  move,
  tone,
}: {
  move: WeightMove;
  /** Verde para alzas de peso, rojo para recortes: solo cifras de variación. */
  tone: "text-positive" | "text-negative";
}) {
  const name = cleanName(move.holding);
  return (
    <Link
      href={actionHref(move.holding.symbol)}
      className="group flex items-center justify-between gap-3 py-2.5"
    >
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-ink-900 underline-offset-4 group-hover:underline">
          {tickerOf(move.holding)}
        </span>
        {name ? (
          <span className="block truncate text-[12px] leading-snug text-ink-500">{name}</span>
        ) : null}
      </span>
      <span className={"num shrink-0 text-[14px] " + tone}>
        {move.delta > 0 ? "+" : ""}
        {formatDecimal(move.delta, 1)} pp
      </span>
    </Link>
  );
}
