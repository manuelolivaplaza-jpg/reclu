"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Upload, Plus, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { saveUserHoldings, clearUserHoldings } from "@/app/actions/holdings";
import Papa from "papaparse";

interface Holding {
  symbol: string;
  name: string;
  weight: number;
}

/** Portafolio del catálogo con sus holdings, para el modo cruce. */
export interface CatalogPortfolio {
  slug: string;
  name: string;
  returnYtd: number | null;
  holdings: { symbol: string; weight: number }[];
}

/** Fila de cruce: activo con su peso en A, en B, o en ambos. */
interface OverlapRow {
  symbol: string;
  weightA: number;
  weightB: number;
  shared: boolean;
}

/**
 * Calcula el cruce entre dos carteras:
 *  - overlapPct: suma de los MENORES de los pesos compartidos (0-100),
 *    la medida estándar de solapamiento entre portafolios.
 *  - rows: acciones en común lado a lado + exclusivas de cada lado.
 */
function computeCross(
  a: { symbol: string; weight: number }[],
  b: { symbol: string; weight: number }[],
): { overlapPct: number; shared: OverlapRow[]; onlyA: OverlapRow[]; onlyB: OverlapRow[] } {
  const normalize = (list: { symbol: string; weight: number }[]) => {
    const map = new Map<string, number>();
    for (const h of list) {
      const key = h.symbol.trim().toUpperCase();
      map.set(key, (map.get(key) ?? 0) + h.weight);
    }
    return map;
  };
  const mapA = normalize(a);
  const mapB = normalize(b);

  const shared: OverlapRow[] = [];
  const onlyA: OverlapRow[] = [];
  const onlyB: OverlapRow[] = [];
  let overlap = 0;

  for (const [symbol, weightA] of mapA) {
    const weightB = mapB.get(symbol);
    if (weightB !== undefined) {
      shared.push({ symbol, weightA, weightB, shared: true });
      overlap += Math.min(weightA, weightB);
    } else {
      onlyA.push({ symbol, weightA, weightB: 0, shared: false });
    }
  }
  for (const [symbol, weightB] of mapB) {
    if (!mapA.has(symbol)) onlyB.push({ symbol, weightA: 0, weightB, shared: false });
  }

  shared.sort((x, y) => y.weightA + y.weightB - (x.weightA + x.weightB));
  onlyA.sort((x, y) => y.weightA - x.weightA);
  onlyB.sort((x, y) => y.weightB - x.weightB);

  return {
    overlapPct: Math.round(overlap * 10) / 10,
    shared,
    onlyA,
    onlyB,
  };
}

function formatWeight(w: number): string {
  return `${w.toFixed(1)}%`;
}

interface PortfolioManagerProps {
  initialHoldings: Holding[];
  /** Catálogo con holdings para el modo "Cruzar dos carteras". */
  catalog?: CatalogPortfolio[];
}

/**
 * Portfolio manager — two input modes:
 * 1. CSV upload (auto-parsed with Papa Parse)
 * 2. Manual entry (add rows)
 * Both normalize to 100% before saving.
 * Además: pestaña "Cruzar dos carteras de reclu" que solapa dos
 * portafolios del catálogo (Pelosi vs. Duquesne, Berkshire, etc.).
 */
export function PortfolioManager({ initialHoldings, catalog = [] }: PortfolioManagerProps) {
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
    () => catalog.filter((p) => p.holdings.length > 0),
    [catalog],
  );
  const [slugA, setSlugA] = useState(crossable[0]?.slug ?? "");
  const [slugB, setSlugB] = useState(crossable[1]?.slug ?? "");
  const portfolioA = crossable.find((p) => p.slug === slugA);
  const portfolioB = crossable.find((p) => p.slug === slugB);
  const cross = useMemo(
    () =>
      portfolioA && portfolioB && portfolioA !== portfolioB
        ? computeCross(portfolioA.holdings, portfolioB.holdings)
        : null,
    [portfolioA, portfolioB],
  );
  const returnDelta =
    portfolioA?.returnYtd != null && portfolioB?.returnYtd != null
      ? portfolioA.returnYtd - portfolioB.returnYtd
      : null;

  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);

  function handleCsv(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed: Holding[] = [];
        for (const row of results.data) {
          // Accept common column names
          const symbol =
            row.symbol ?? row.ticker ?? row.Symbol ?? row.Ticker ?? row["Símbolo"] ?? "";
          const name = row.name ?? row.Name ?? row["Nombre"] ?? "";
          const weightRaw =
            row.weight ?? row.Weight ?? row["Peso"] ?? row["Ponderación"] ?? row.percentage ?? "";
          const weight = parseFloat(String(weightRaw).replace(/[%,\s]/g, ""));
          if (symbol && !isNaN(weight)) {
            parsed.push({ symbol: symbol.trim(), name: name.trim(), weight });
          }
        }
        if (parsed.length === 0) {
          setMessage({
            type: "error",
            text: "No se encontraron filas válidas. Usa columnas: symbol/ticker, name, weight.",
          });
          return;
        }
        setHoldings(parsed);
        setMessage({ type: "success", text: `${parsed.length} activos importados del CSV.` });
      },
      error: (err) => {
        setMessage({ type: "error", text: `Error al leer el CSV: ${err.message}` });
      },
    });
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
    setLoading(true);
    await clearUserHoldings();
    setLoading(false);
    setHoldings([]);
    setMessage({ type: "success", text: "Cartera eliminada." });
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
            <CardTitle className="text-base">Subir CSV</CardTitle>
            <CardDescription>
              Columnas: symbol, name, weight. También acepta ticker, peso, ponderación.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCsv(file);
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" />
              Elegir archivo CSV
            </Button>
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
            <table className="w-full text-sm">
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
                        className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-negative"
                        aria-label={`Eliminar ${h.symbol}`}
                      >
                        <X className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
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
  crossable: CatalogPortfolio[];
  slugA: string;
  slugB: string;
  onSelectA: (slug: string) => void;
  onSelectB: (slug: string) => void;
  portfolioA?: CatalogPortfolio;
  portfolioB?: CatalogPortfolio;
  cross: { overlapPct: number; shared: OverlapRow[]; onlyA: OverlapRow[]; onlyB: OverlapRow[] } | null;
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
                <table className="w-full text-sm">
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
