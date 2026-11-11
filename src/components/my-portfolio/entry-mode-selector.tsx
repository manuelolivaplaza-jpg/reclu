"use client";

import {
  HOLDING_ENTRY_MODES,
  HOLDING_ENTRY_MODE_LABELS,
  type HoldingEntryMode,
} from "@/lib/holdings-entry";
import { cn } from "@/lib/utils";

/**
 * EntryModeSelector — selector de modo de carga de la cartera (F78).
 *
 * Un solo modo por cartera: cantidad de acciones, monto en dinero o
 * porcentaje. Aparece antes de la tabla de posiciones en /compare y en
 * /mi-portafolio.
 *
 * Estética Autopilot × SpaceX: control segmentado de radio 0 con filetes de
 * 1px; la opción activa es tinta sólida con texto blanco. Sin sombras ni color
 * de marca. En móvil los segmentos se apilan para que el toque sea cómodo.
 */

const MODE_HINTS: Record<HoldingEntryMode, string> = {
  shares: "Ingresa cuántas acciones tienes de cada símbolo.",
  amount:
    "Ingresa el monto invertido en cada símbolo, solo en dólares (USD). Las acciones chilenas van por cantidad o porcentaje.",
  percentage: "Ingresa el porcentaje de la cartera de cada símbolo.",
};

export function EntryModeSelector({
  mode,
  onChange,
  disabled,
}: {
  mode: HoldingEntryMode;
  onChange: (mode: HoldingEntryMode) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2.5" disabled={disabled}>
      <legend className="text-[13px] font-normal text-ink-500">
        ¿Cómo ingresas tu cartera?
      </legend>
      <div
        role="radiogroup"
        aria-label="Modo de ingreso de la cartera"
        className="grid w-full max-w-xl grid-cols-1 border border-ink-200 bg-white"
      >
        {HOLDING_ENTRY_MODES.map((option, index) => {
          const active = option === mode;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option)}
              className={cn(
                "flex h-11 min-w-0 items-center justify-center px-4 text-[13px] font-medium transition-colors sm:h-10",
                "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-ink-900",
                index > 0 && "border-t border-ink-200 sm:border-l sm:border-t-0",
                active
                  ? "bg-ink-900 text-white"
                  : "bg-white text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                "disabled:opacity-50",
              )}
            >
              <span className="truncate">{HOLDING_ENTRY_MODE_LABELS[option]}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[12px] leading-relaxed text-ink-500">
        {MODE_HINTS[mode]}
      </p>
    </fieldset>
  );
}
