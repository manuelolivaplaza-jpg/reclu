"use client";

import { useId, useRef } from "react";
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
 * Semántica de radiogroup: un solo tab stop (la opción activa) y navegación
 * con flechas, Inicio y Fin, como un grupo de radios nativo. La opción activa
 * es tinta sólida con texto blanco; el resto, filete de 1px sobre blanco.
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
  const labelId = useId();
  const groupRef = useRef<HTMLDivElement>(null);

  function focusOption(index: number) {
    const options =
      groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    options?.[index]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const current = HOLDING_ENTRY_MODES.indexOf(mode);
    const last = HOLDING_ENTRY_MODES.length - 1;
    let next = -1;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = current >= last ? 0 : current + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = current <= 0 ? last : current - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = last;
    } else {
      return;
    }

    event.preventDefault();
    const target = HOLDING_ENTRY_MODES[next];
    if (!target) return;
    onChange(target);
    focusOption(next);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p id={labelId} className="text-[13px] font-normal leading-snug text-ink-500">
        ¿Cómo ingresas tu cartera?
      </p>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={handleKeyDown}
        className="grid w-full max-w-xl grid-cols-1 border border-line bg-canvas sm:grid-cols-3"
      >
        {HOLDING_ENTRY_MODES.map((option, index) => {
          const active = option === mode;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(option)}
              className={cn(
                "flex min-h-11 min-w-0 items-center justify-center px-3 py-2 text-center text-[13px] font-medium leading-tight transition-colors",
                "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px]",
                index > 0 && "border-t border-line sm:border-l sm:border-t-0",
                active
                  ? "bg-ink-900 text-white focus-visible:outline-white"
                  : "bg-canvas text-ink-600 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-ink-900",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {HOLDING_ENTRY_MODE_LABELS[option]}
            </button>
          );
        })}
      </div>
      <p className="text-[12px] leading-relaxed text-ink-500">{MODE_HINTS[mode]}</p>
    </div>
  );
}
