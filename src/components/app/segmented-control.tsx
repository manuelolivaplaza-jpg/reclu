"use client";

import { useId, useRef } from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption {
  value: string;
  label: string;
}

/**
 * Segmented control / tabs accesible (role=tablist), filete de 1px y radio 0.
 * Teclado: flechas para moverse entre segmentos, Home/End a los extremos.
 * Si el bloque que cambia tiene id, pásalo en `panelId` para atar
 * `aria-controls` al panel correspondiente.
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  panelId,
  className,
}: {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  panelId?: string;
  className?: string;
}) {
  const baseId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    refs.current[index]?.focus();
    onChange(option.value);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        select((index + 1) % options.length);
        break;
      case "ArrowLeft":
        event.preventDefault();
        select((index - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        select(0);
        break;
      case "End":
        event.preventDefault();
        select(options.length - 1);
        break;
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={cn("inline-flex items-stretch rounded-none border border-line bg-canvas p-0.5", className)}
    >
      {options.map((o, index) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={`${baseId}-${o.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-11 items-center whitespace-nowrap rounded-none px-4 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 sm:min-h-9",
              active ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-50 hover:text-ink-900",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
