"use client";

import { cn } from "@/lib/utils";

export interface SegmentOption {
  value: string;
  label: string;
}

/** Segmented control / tabs accesible (role=tablist), filete de 1px y radio 0. */
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
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={cn("inline-flex items-stretch rounded-none border border-ink-200 bg-white p-0.5", className)}
    >
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
              "inline-flex min-h-9 items-center whitespace-nowrap rounded-none px-4 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink-900",
              active ? "bg-ink-900 text-white" : "bg-white text-ink-500 hover:bg-ink-50 hover:text-ink-900",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
