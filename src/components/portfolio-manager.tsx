"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Upload, Plus, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  saveUserHoldings,
  deleteEntirePortfolio,
  importHoldings as importHoldingsCsv,
} from "@/app/actions/holdings";
import { OverlapPanel } from "@/components/overlap-panel";
import type {
  CompareCross,
  ComparePairSummary,
  ComparePortfolioSummary,
} from "@/lib/compare-overlap";

interface Holding {
  symbol: string;
  name: string;
  weight: number;
}

/**
 * Resuelve el cruce precalculado en el servidor. El payload solo trae pares
 * en el orden del catálogo, así que si el usuario eligió B antes que A se
 * invierten los lados.
 */
function crossForPair(
  pairs: ComparePairSummary[],
  slugA: string,
  slugB: string,
): CompareCross | null {
  const direct = pairs.find((p) => p.slugA === slugA && p.slugB === slugB);
  if (direct) {
    return {
      overlapPct: direct.overlapPct,
      shared: direct.shared.map((row) => ({ ...row, shared: true })),
      onlyA: direct.onlyA.map((row) => ({ symbol: row.symbol, weightA: row.weight, weightB: 0, shared: false })),
      onlyB: direct.onlyB.map((row) => ({ symbol: row.symbol, weightA: 0, weightB: row.weight, shared: false })),
    };
  }

  const reverse = pairs.find((p) => p.slugA === slugB && p.slugB === slugA);
  if (!reverse) return null;
  return {
    overlapPct: reverse.overlapPct,
    shared: reverse.shared.map((row) => ({
      symbol: row.symbol,
      weightA: row.weightB,
      weightB: row.weightA,
      shared: true,
    })),
    onlyA: reverse.onlyB.map((row) => ({ symbol: row.symbol, weightA: row.weight, weightB: 0, shared: false })),
    onlyB: reverse.onlyA.map((row) => ({ symbol: row.symbol, weightA: 0, weightB: row.weight, shared: false })),
  };
}

function formatWeight(w: number): string {
  return `${w.toFixed(1)}%`;
}

interface PortfolioManagerProps {
  initialHoldings: Holding[];
  /** Resumen por portafolio (sin holdings completos), calculado en servidor. */
  catalog?: ComparePortfolioSummary[];
  /** Cruces precalculados entre pares del catálogo. */
  pairs?: ComparePairSummary[];
}

/**
 * Portfolio manager — two input modes:
 * 1. CSV upload (auto-parsed with Papa Parse)
 * 2. Manual entry (add rows)
 * Both normalize to 100% before saving.
 * Además: pestaña "Cruzar dos carteras de reclu" que solapa dos
 * portafolios del catálogo (Pelosi vs. Duquesne, Berkshire, etc.).
 */
export function PortfolioManager({
  initialHoldings,
  catalog = [],
  pairs = [],
}: PortfolioManagerProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"mine" | "cross">("mine");
  const [holdings, setHoldings] = useState<Holding[]>(initialHoldings);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // --- Modo cruce: portafolio A y B del catálogo ---
  const crossable = useMemo(
    () => catalog.filter((p) => p.holdingsCount > 0),
    [catalog],
  );
  const [slugA, setSlugA] = useState(crossable[0]?.slug ?? "");
  const [slugB, setSlugB] = useState(crossable[1]?.slug ?? "");
  const portfolioA = crossable.find((p) => p.slug === slugA);
  const portfolioB = crossable.find((p) => p.slug === slugB);
  const cross = useMemo(
    () =>
      portfolioA && portfolioB && portfolioA !== portfolioB
        ? crossForPair(pairs, portfolioA.slug, portfolioB.slug)
        : null,
    [pairs, portfolioA, portfolioB],
  );
  const returnDelta =
    portfolioA?.returnYtd != null && portfolioB?.returnYtd != null
      ? portfolioA.returnYtd - portfolioB.returnYtd
      : null;

  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  const overlapSymbols = useMemo(() => holdings.map((h) => h.symbol), [holdings]);

  async function handleImport(file: File) {
    if (file.size > 1_000_000) {
      setMessage({ type: "error", text: "El CSV supera 1 MB. Divídelo en archivos más chicos." });
      return;
    }
    setLoading(true);
    const text = await file.text();
    const result = await importHoldingsCsv(text);
    setLoading(false);
    if (result.error) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setHoldings(
      (result.holdings ?? []).map((row) => ({
        symbol: row.symbol,
        name: "",
        weight: row.weight,
      })),
    );
    setMessage({
      type: "success",
      text:
        (result.success ?? "Cartera importada.") +
        (result.warnings ? ` ${result.warnings} fila(s) con problemas se ignoraron.` : ""),
    });
    router.refresh();
  }

  function addHolding() {
    const weight = parseFloat(newWeight);
    if (!newSymbol.trim() || isNaN(weight) || weight <= 0) {
      setMessage({ type: "error", text: "Ingresa un símbolo y una ponderación válida." });
      return;
    }
    setHoldings((prev) => [...prev, { symbol: newSymbol.trim(), name: "", weight }]);
    setNewSymbol("");
    setNewWeight("");
    setMessage(null);
  }

  function removeHolding(index: number) {
    setHoldings((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (holdings.length === 0) return;
    setLoading(true);
    const result = await saveUserHoldings(holdings);
    setLoading(false);
    if (result.error) setMessage({ type: "error", text: result.error });
    else {
      setMessage({ type: "success", text: result.success! });
      router.refresh();
    }
  }

  async function handleClear() {
    if (
      !window.confirm(
        "Se borrará toda tu cartera: posiciones, consentimiento, alertas y registro de consultas. No se puede deshacer.",
      )
    ) {
      return;
    }
    setLoading(true);
    const result = await deleteEntirePortfolio();
    setLoading(false);
    if (result.error) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setHoldings([]);
    setMessage({ type: "success", text: result.success! });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          Mi cartera
        </h1>
        <p className="mt-1.5 text-ink-600">
          Sube tu portafolio para compararlo con los que sigues.
        </p>
      </div>

      {/* Tabs de modo: Mi cartera vs. Cruce de carteras */}
      <div role="tablist" aria-label="Modo de comparación" className="flex gap-6 border-b border-ink-200">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "mine"}
          onClick={() => setMode("mine")}
          className={
            "-mb-px border-b-2 pb-3 text-[15px] transition-colors " +
            (mode === "mine"
              ? "border-ink-900 font-medium text-ink-900"
              : "border-transparent text-ink-500 hover:text-ink-900")
          }
        >
          Mi cartera vs. Portafolio
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "cross"}
          onClick={() => setMode("cross")}
          className={
            "-mb-px border-b-2 pb-3 text-[15px] transition-colors " +
            (mode === "cross"
              ? "border-ink-900 font-medium text-ink-900"
              : "border-transparent text-ink-500 hover:text-ink-900")
          }
        >
          Cruzar dos carteras de reclu
        </button>
      </div>

      {mode === "cross" ? (
        <CrossPanel
          crossable={crossable}
          slugA={slugA}
          slugB={slugB}
          onSelectA={setSlugA}
          onSelectB={setSlugB}
          portfolioA={portfolioA}
          portfolioB={portfolioB}
          cross={cross}
          returnDelta={returnDelta}
        />
      ) : (
        <>
      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={
            "text-sm font-medium " +
            (message.type === "error" ? "text-negative" : "text-positive")
          }
        >
          {message.text}
        </p>
      )}

      {/* Import methods */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Importar CSV</CardTitle>
            <CardDescription>
              Columnas: símbolo y cantidad (por ejemplo AAPL, 12). También acepta
              ticker, shares o acciones. Hasta 100 activos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Permite volver a elegir el mismo archivo.
                e.target.value = "";
                if (file) void handleImport(file);
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} loading={loading}>
              <Upload className="size-4" />
              Importar CSV
            </Button>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
              La cantidad se convierte en peso relativo para comparar. Tu
              cartera es privada y no se publica.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agregar manual</CardTitle>
            <CardDescription>Ingresa un activo a la vez.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  placeholder="AAPL"
                  label="Símbolo"
                />
              </div>
              <div className="w-24">
                <Input
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  placeholder="25"
                  label="Peso %"
                  type="number"
                  min="0"
                  max="100"
                />
              </div>
              <Button variant="outline" onClick={addHolding} className="mb-0.5">
                <Plus className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current holdings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Tu cartera</CardTitle>
              <CardDescription>
                {holdings.length} activo{holdings.length !== 1 ? "s" : ""}
                {totalWeight > 0 && (
                  <>
                    {" "}· Total: <strong className="tabular-nums">{totalWeight.toFixed(1)}%</strong>{" "}
                    {Math.abs(totalWeight - 100) > 0.5 && (
                      <span className="text-warning">
                        (se normalizará a 100% al guardar)
                      </span>
                    )}
                  </>
                )}
              </CardDescription>
            </div>
            {holdings.length > 0 && (
              <div className="flex gap-2">
                <Button onClick={handleSave} loading={loading}>
                  Guardar
                </Button>
                <Button variant="ghost" onClick={handleClear} disabled={loading}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {holdings.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-600">
              Aún no tienes activos. Sube un CSV o agrega uno manualmente.
            </p>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <th className="pb-2">Símbolo</th>
                  <th className="pb-2">Nombre</th>
                  <th className="pb-2 text-right">Peso</th>
                  <th className="pb-2 text-right">Normalizado</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {holdings.map((h, i) => (
                  <tr key={`${h.symbol}-${i}`}>
                    <td className="py-2.5 font-medium text-ink-900">{h.symbol}</td>
                    <td className="py-2.5 text-ink-600">{h.name || "—"}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink-900">
                      {h.weight.toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-ink-500">
                      {totalWeight > 0 ? ((h.weight / totalWeight) * 100).toFixed(1) : "0.0"}%
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => removeHolding(i)}
                        className="-m-3 inline-flex size-11 items-center justify-center rounded text-ink-400 hover:bg-ink-100 hover:text-negative"
                        aria-label={`Eliminar ${h.symbol}`}
                      >
                        <X className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>

      <OverlapPanel symbols={overlapSymbols} />
        </>
      )}
    </div>
  );
}

/**
 * CrossPanel — UI del cruce de dos carteras del catálogo.
 * Selectores sobrios nativos (radio 0, filete) + tabla de solapamiento
 * con pesos lado a lado y diferencial de retorno YTD.
 */
function CrossPanel({
  crossable,
  slugA,
  slugB,
  onSelectA,
  onSelectB,
  portfolioA,
  portfolioB,
  cross,
  returnDelta,
}: {
  crossable: ComparePortfolioSummary[];
  slugA: string;
  slugB: string;
  onSelectA: (slug: string) => void;
  onSelectB: (slug: string) => void;
  portfolioA?: ComparePortfolioSummary;
  portfolioB?: ComparePortfolioSummary;
  cross: CompareCross | null;
  returnDelta: number | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Selectores A y B */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="cross-a"
            className="mb-2 block text-[13px] font-normal text-ink-500"
          >
            Portafolio A
          </label>
          <select
            id="cross-a"
            value={slugA}
            onChange={(e) => onSelectA(e.target.value)}
            className="h-11 w-full border border-ink-200 bg-white px-3 text-[15px] text-ink-900 focus:border-ink-900 focus:outline-none"
          >
            {crossable.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="cross-b"
            className="mb-2 block text-[13px] font-normal text-ink-500"
          >
            Portafolio B
          </label>
          <select
            id="cross-b"
            value={slugB}
            onChange={(e) => onSelectB(e.target.value)}
            className="h-11 w-full border border-ink-200 bg-white px-3 text-[15px] text-ink-900 focus:border-ink-900 focus:outline-none"
          >
            {crossable.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {crossable.length < 2 ? (
        <p className="py-8 text-center text-sm text-ink-600">
          Se necesitan al menos dos carteras con composición para cruzar.
        </p>
      ) : cross && portfolioA && portfolioB ? (
        <>
          {/* Cifras clave: solapamiento y diferencial YTD */}
          <div className="grid gap-px border border-ink-200 bg-ink-200 sm:grid-cols-2">
            <div className="bg-white p-6">
              <p className="text-[13px] font-normal text-ink-500">Solapamiento</p>
              <p className="num mt-1 text-[clamp(2.25rem,4vw,3rem)] leading-none text-ink-900">
                {cross.overlapPct.toFixed(1)}%
              </p>
              <p className="mt-2 text-[13px] text-ink-500">
                {cross.shared.length} activo{cross.shared.length !== 1 ? "s" : ""} en común
                entre {portfolioA.name} y {portfolioB.name}.
              </p>
            </div>
            <div className="bg-white p-6">
              <p className="text-[13px] font-normal text-ink-500">Diferencial YTD (A − B)</p>
              {returnDelta !== null ? (
                <p
                  className={
                    "num mt-1 text-[clamp(2.25rem,4vw,3rem)] leading-none " +
                    (returnDelta > 0 ? "text-positive" : returnDelta < 0 ? "text-negative" : "text-ink-900")
                  }
                >
                  {returnDelta > 0 ? "+" : ""}
                  {returnDelta.toFixed(1)} pp
                </p>
              ) : (
                <p className="mt-1 text-[15px] text-ink-500">Sin retorno YTD reportado.</p>
              )}
              {portfolioA.returnYtd !== null && portfolioB.returnYtd !== null && (
                <p className="mt-2 text-[13px] text-ink-500">
                  {portfolioA.name}: {portfolioA.returnYtd > 0 ? "+" : ""}
                  {portfolioA.returnYtd.toFixed(1)}% · {portfolioB.name}:{" "}
                  {portfolioB.returnYtd > 0 ? "+" : ""}
                  {portfolioB.returnYtd.toFixed(1)}%
                </p>
              )}
            </div>
          </div>

          {/* Acciones en común, pesos lado a lado */}
          {cross.shared.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Acciones en común</CardTitle>
                <CardDescription>
                  Peso en {portfolioA.name} y en {portfolioB.name}, lado a lado.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[320px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                      <th className="pb-2">Símbolo</th>
                      <th className="pb-2 text-right">{portfolioA.name}</th>
                      <th className="pb-2 text-right">{portfolioB.name}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {cross.shared.map((row) => (
                      <tr key={row.symbol}>
                        <td className="py-2.5 font-medium text-ink-900">{row.symbol}</td>
                        <td className="py-2.5 text-right tabular-nums text-ink-900">
                          {formatWeight(row.weightA)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-ink-900">
                          {formatWeight(row.weightB)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Exclusivas de cada lado */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Solo en {portfolioA.name}</CardTitle>
                <CardDescription>{cross.onlyA.length} activo{cross.onlyA.length !== 1 ? "s" : ""}.</CardDescription>
              </CardHeader>
              <CardContent>
                {cross.onlyA.length === 0 ? (
                  <p className="text-sm text-ink-600">Ninguno.</p>
                ) : (
                  <ul>
                    {cross.onlyA.map((row) => (
                      <li key={row.symbol} className="flex justify-between border-b border-ink-100 py-2 text-sm">
                        <span className="font-medium text-ink-900">{row.symbol}</span>
                        <span className="tabular-nums text-ink-900">{formatWeight(row.weightA)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Solo en {portfolioB.name}</CardTitle>
                <CardDescription>{cross.onlyB.length} activo{cross.onlyB.length !== 1 ? "s" : ""}.</CardDescription>
              </CardHeader>
              <CardContent>
                {cross.onlyB.length === 0 ? (
                  <p className="text-sm text-ink-600">Ninguno.</p>
                ) : (
                  <ul>
                    {cross.onlyB.map((row) => (
                      <li key={row.symbol} className="flex justify-between border-b border-ink-100 py-2 text-sm">
                        <span className="font-medium text-ink-900">{row.symbol}</span>
                        <span className="tabular-nums text-ink-900">{formatWeight(row.weightB)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="text-xs leading-relaxed text-ink-500">
            Cálculo sobre composiciones publicadas. El solapamiento suma el menor
            peso de cada activo compartido. No constituye asesoría de inversión.
          </p>
        </>
      ) : (
        <p className="py-8 text-center text-sm text-ink-600">
          Elige dos portafolios distintos para cruzar.
        </p>
      )}
    </div>
  );
}
