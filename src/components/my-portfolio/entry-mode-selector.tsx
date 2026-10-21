"use client";

import {
  HOLDING_ENTRY_MODES,
  HOLDING_ENTRY_MODE_LABELS,
  type HoldingEntryMode,
} from "@/lib/holdings-entry";

/**
 * EntryModeSelector — selector de modo de carga de la cartera (F78).
 *
 * Un solo modo por cartera: cantidad de acciones, monto en dinero o
 * porcentaje. Aparece antes de la tabla de posiciones en /compare y en
 * /mi-portafolio.
 *
 * Estética Autopilot × SpaceX: píldora negra para la opción activa, borde de
 * 1px para las demás, sin sombras ni color de marca.
 */

const MODE_HINTS: Record<HoldingEntryMode, string> = {
  shares: "Ingresa cuántas acciones tienes de cada símbolo.",
  amount: "Ingresa el monto invertido en cada símbolo, solo en dólares (USD). Las acciones chilenas van por cantidad o porcentaje.",
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
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-[13px] font-normal text-ink-500">
        ¿Cómo ingresas tu cartera?
      </legend>
      <div
        role="radiogroup"
        aria-label="Modo de ingreso de la cartera"
        className="flex flex-wrap gap-2"
      >
        {HOLDING_ENTRY_MODES.map((option) => {
          const active = option === mode;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option)}
              className={
                "h-9 rounded-full border px-4 text-sm transition-colors " +
                (active
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-ink-200 bg-white text-ink-600 hover:border-ink-400 hover:text-ink-900")
              }
            >
              {HOLDING_ENTRY_MODE_LABELS[option]}
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
