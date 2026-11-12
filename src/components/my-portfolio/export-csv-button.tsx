"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ValuedPositionRow } from "@/components/my-portfolio/types";

/** Escapa un campo CSV (comillas, comas y saltos de línea). */
function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(rows: ValuedPositionRow[]): string {
  const header = [
    "simbolo",
    "nombre",
    "cantidad",
    "costo_promedio",
    "moneda",
    "precio",
    "valor",
    "pnl",
    "pnl_pct",
    "peso_pct",
    "mercado",
    "fecha_precio",
  ];
  const lines = rows.map((row) =>
    [
      row.symbol,
      row.name,
      row.quantity,
      row.avgCost,
      row.currency,
      row.price,
      row.value,
      row.pnl,
      row.pnlPct,
      row.weightPct,
      row.market,
      row.priceDate,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

/** Nombre del archivo con la fecha local, para distinguir exportaciones. */
function fileNameFor(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `mi-portafolio-${year}-${month}-${day}.csv`;
}

/**
 * Exportación CSV de Mi portafolio. Solo Elite (`portfolioExportCsv` en
 * plans.ts). Para el resto queda deshabilitado con la razón visible.
 *
 * TODO(F62): si se quiere auditar la exportación, mover la generación a una
 * server action con el cliente de sesión y revalidar el plan en servidor.
 */
export function ExportCsvButton({
  rows,
  enabled,
}: {
  rows: ValuedPositionRow[];
  enabled: boolean;
}) {
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");

  async function handleExport() {
    if (!enabled || rows.length === 0 || generating) return;
    setGenerating(true);
    setStatus("Generando el CSV…");
    // Cede un frame para que el estado "Generando" se pinte antes del trabajo.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    try {
      const fileName = fileNameFor(new Date());
      const blob = new Blob([`\uFEFF${buildCsv(rows)}`], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revocar de inmediato puede cancelar la descarga en algunos navegadores.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`Descargamos ${fileName}`);
    } catch {
      setStatus("No pudimos generar el archivo. Inténtalo de nuevo.");
    } finally {
      setGenerating(false);
    }
  }

  const blockedReason = !enabled
    ? "La exportación CSV está disponible en Elite."
    : rows.length === 0
      ? "Aún no hay posiciones para exportar."
      : "";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void handleExport()}
        disabled={!enabled || rows.length === 0 || generating}
        aria-busy={generating || undefined}
        title={blockedReason || "Descarga tu cartera valorizada en CSV"}
      >
        <Download className="size-4" strokeWidth={1.5} aria-hidden />
        {generating ? "Generando…" : "Exportar CSV"}
      </Button>
      {blockedReason && (
        <span className="text-[12px] leading-snug text-ink-500">{blockedReason}</span>
      )}
      <span role="status" className="text-[12px] leading-snug text-ink-500">
        {status}
      </span>
    </div>
  );
}
