"use client";

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
  function handleExport() {
    if (!enabled || rows.length === 0) return;
    const blob = new Blob([`\uFEFF${buildCsv(rows)}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mi-portafolio.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={!enabled || rows.length === 0}
        title={
          enabled
            ? "Descarga tu cartera valorizada en CSV"
            : "La exportación CSV está disponible en Elite."
        }
      >
        <Download className="size-4" strokeWidth={1.5} />
        Exportar CSV
      </Button>
      {!enabled && (
        <span className="text-[12px] text-ink-500">
          Disponible en Elite.
        </span>
      )}
    </div>
  );
}
