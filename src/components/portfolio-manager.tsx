"use client";

import { useState, useRef } from "react";
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

interface PortfolioManagerProps {
  initialHoldings: Holding[];
}

/**
 * Portfolio manager — two input modes:
 * 1. CSV upload (auto-parsed with Papa Parse)
 * 2. Manual entry (add rows)
 * Both normalize to 100% before saving.
 */
export function PortfolioManager({ initialHoldings }: PortfolioManagerProps) {
  const router = useRouter();
  const [holdings, setHoldings] = useState<Holding[]>(initialHoldings);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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

      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={
            "rounded-lg px-4 py-2.5 text-sm font-medium " +
            (message.type === "error"
              ? "bg-negative-bg text-negative"
              : "bg-accent-50 text-accent-700")
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
    </div>
  );
}
