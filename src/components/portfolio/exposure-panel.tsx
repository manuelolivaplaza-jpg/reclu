import type { Holding } from "@/lib/types";

/**
 * d94 · Panel de exposición — moneda y tipo de activo.
 *
 * Se monta en la ficha de portafolio cuando las posiciones ya están visibles
 * (el muro lo resuelve el llamador). No decide accesos ni lee datos: solo
 * agrupa los pesos que recibe.
 *
 * Dos lecturas, con el mismo total declarado como base:
 *  1) Por moneda: cuánto del peso está en USD, CLP, EUR o sin moneda.
 *  2) Por tipo de activo: renta variable, fondos, ETF, caja, renta fija y otros.
 *
 * Las barras son monocromas y decorativas; el dato vive en el texto (dt/dd).
 * Si los pesos no suman 100, se dice con la cifra real y se aclara que las
 * barras usan ese total como base. Ningún dato faltante se rellena a mano.
 */

export interface ExposurePanelProps {
  holdings: Holding[];
}

interface Classification {
  key: string;
  label: string;
}

interface GroupBucket extends Classification {
  /** Suma de pesos declarados del grupo (0–100 por posición). */
  weight: number;
  /** Cantidad de posiciones del grupo, incluidas las de peso 0. */
  count: number;
}

const CURRENCY_LABELS: Record<string, string> = {
  USD: "Dólar (USD)",
  CLP: "Peso chileno (CLP)",
  EUR: "Euro (EUR)",
};

const ASSET_CLASS_LABELS: Record<string, string> = {
  equity: "Renta variable",
  fund: "Fondos",
  etf: "ETF",
  cash: "Caja",
  bond: "Renta fija",
};

/** Peso válido para sumar: finito y positivo. El resto aporta 0, sin inventar. */
function declaredWeight(holding: Holding): number {
  const weight = Number(holding.weight);
  return Number.isFinite(weight) && weight > 0 ? weight : 0;
}

function classifyCurrency(holding: Holding): Classification {
  const code = String(holding.currency ?? "").trim().toUpperCase();
  if (!code) return { key: "cur:none", label: "Sin moneda" };
  const known = CURRENCY_LABELS[code];
  if (known) return { key: `cur:${code}`, label: known };
  // Un código fuera de la lista se muestra tal cual: no se disfraza de otra moneda.
  return { key: `cur:${code}`, label: `Sin clasificar (${code})` };
}

function classifyAssetClass(holding: Holding): Classification {
  const code = String(holding.asset_class ?? "").trim().toLowerCase();
  if (!code || code === "other") return { key: "asset:other", label: "Otros" };
  const known = ASSET_CLASS_LABELS[code];
  if (known) return { key: `asset:${code}`, label: known };
  return { key: "asset:other", label: "Otros" };
}

/** Agrupa por clasificación y ordena de mayor a menor peso declarado. */
function groupBy(
  rows: Holding[],
  classify: (holding: Holding) => Classification,
): GroupBucket[] {
  const buckets = new Map<string, GroupBucket>();
  for (const holding of rows) {
    const { key, label } = classify(holding);
    const weight = declaredWeight(holding);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.weight += weight;
      bucket.count += 1;
    } else {
      buckets.set(key, { key, label, weight, count: 1 });
    }
  }
  return Array.from(buckets.values()).sort(
    (a, b) => b.weight - a.weight || a.label.localeCompare(b.label, "es"),
  );
}

/** Porcentaje con coma decimal chilena y un decimal ("62,4%"). */
function formatPct(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safe * 10) / 10;
  return `${rounded.toLocaleString("es-CL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function ExposurePanel({ holdings }: ExposurePanelProps) {
  const rows = (Array.isArray(holdings) ? holdings : []).filter(Boolean);
  const total = rows.reduce((sum, holding) => sum + declaredWeight(holding), 0);
  const currencyGroups = groupBy(rows, classifyCurrency);
  const assetGroups = groupBy(rows, classifyAssetClass);
  const unbalanced = Math.abs(total - 100) > 0.5;

  return (
    <section aria-labelledby="exposicion" className="app-panel p-5 sm:p-6">
      <header className="border-b border-line pb-3">
        <h2
          id="exposicion"
          className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-ink-900"
        >
          Exposición
        </h2>
        <p className="label-line mt-1">
          Reparto del peso declarado por moneda y por tipo de activo.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="label-line mt-4">Sin posiciones para analizar.</p>
      ) : total <= 0 ? (
        <p className="label-line mt-4">
          Las posiciones no traen un peso declarado; no hay exposición que calcular.
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-5 md:grid-cols-2 md:gap-0">
            <ExposureBlock
              title="Por moneda"
              groups={currencyGroups}
              total={total}
              className="md:pr-6 lg:pr-8"
            />
            <ExposureBlock
              title="Por tipo de activo"
              groups={assetGroups}
              total={total}
              className="border-t border-line pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0 lg:pl-8"
            />
          </div>

          {unbalanced ? (
            <p className="mt-5 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-500">
              Los pesos declarados suman {formatPct(total)}; las barras usan ese total
              como base.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function ExposureBlock({
  title,
  groups,
  total,
  className = "",
}: {
  title: string;
  groups: GroupBucket[];
  /** Total declarado del portafolio: base de todos los porcentajes. */
  total: number;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <h3 className="label-line">{title}</h3>

      <dl className="mt-1 border-t border-line">
        {groups.map((group) => {
          const share = total > 0 ? (group.weight / total) * 100 : 0;
          const width = Math.min(100, Math.max(0, share));
          return (
            <div
              key={group.key}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 border-b border-line bg-app-card py-3"
            >
              <dt className="label-line min-w-0 break-words">{group.label}</dt>
              <dd className="flex shrink-0 items-baseline gap-2">
                <span className="num text-[15px] leading-none text-ink-900">
                  {formatPct(share)}
                </span>
                <span className="text-[12px] leading-none text-ink-500">
                  {group.count} {group.count === 1 ? "posición" : "posiciones"}
                </span>
              </dd>
              {/* Barra decorativa: el porcentaje y el conteo ya están en texto. */}
              <dd aria-hidden="true" className="h-1.5 w-full border border-line bg-app-card">
                <div
                  className="h-full bg-ink-900"
                  style={{ width: `${width}%`, minWidth: width > 0 ? 2 : 0 }}
                />
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
