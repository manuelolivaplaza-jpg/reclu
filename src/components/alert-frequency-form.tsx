"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updateSettings } from "@/app/actions/settings";
import type { FormState } from "@/lib/form-state";

const FREQUENCIES = [
  { value: "realtime", label: "Tiempo real", desc: "Alerta inmediata en cada cambio (requiere Pro)" },
  { value: "daily", label: "Diario", desc: "Un resumen con todas las alertas del día" },
  { value: "weekly", label: "Semanal", desc: "Un resumen semanal" },
];

export function AlertFrequencyForm({
  current,
  isPro,
}: {
  current: string;
  isPro: boolean;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(updateSettings, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.success && (
        <p role="status" className="rounded-lg bg-accent-50 px-3 py-2 text-sm font-medium text-accent-700">
          {state.success}
        </p>
      )}
      {FREQUENCIES.map((freq) => {
        const disabled = freq.value === "realtime" && !isPro;
        return (
          <label
            key={freq.value}
            className={
              "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors " +
              (disabled
                ? "cursor-not-allowed border-ink-200 opacity-60"
                : current === freq.value
                  ? "border-brand-500 bg-brand-50/50"
                  : "border-ink-200 hover:border-ink-300")
            }
          >
            <input
              type="radio"
              name="alert_frequency"
              value={freq.value}
              defaultChecked={current === freq.value}
              disabled={disabled}
              className="mt-0.5 accent-brand-600"
            />
            <span>
              <span className="text-sm font-medium text-ink-900">
                {freq.label}
                {disabled && <span className="ml-2 text-xs text-ink-500">(Pro)</span>}
              </span>
              <span className="mt-0.5 block text-xs text-ink-600">{freq.desc}</span>
            </span>
          </label>
        );
      })}
      <Button type="submit" variant="outline" loading={isPending} className="mt-2 w-fit">
        Guardar frecuencia
      </Button>
    </form>
  );
}
