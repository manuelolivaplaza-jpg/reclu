"use client";

import { cn } from "@/lib/utils";

export interface SegmentOption {
  value: string;
  label: string;
}

/** Segmented control / tabs accesible (role=tablist). */
export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("inline-flex rounded-full bg-ink-100 p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-9 rounded-full px-4 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ink-900",
              active ? "bg-white text-ink-900 shadow-app" : "text-ink-500 hover:text-ink-900",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}