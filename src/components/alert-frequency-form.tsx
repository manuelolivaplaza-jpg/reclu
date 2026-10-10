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
        <p role="status" className="text-sm font-medium text-positive">
          {state.success}
        </p>
      )}
      {FREQUENCIES.map((freq) => {
        const disabled = freq.value === "realtime" && !isPro;
        const active = current === freq.value;
        return (
          <label
            key={freq.value}
            className={
              "flex cursor-pointer items-start gap-3 border p-4 transition-colors " +
              (disabled
                ? "cursor-not-allowed border-ink-200 opacity-60"
                : active
                  ? "border-ink-900"
                  : "border-ink-200 hover:border-ink-400")
            }
          >
            <input
              type="radio"
              name="alert_frequency"
              value={freq.value}
              defaultChecked={active}
              disabled={disabled}
              className="mt-1 accent-ink-900"
            />
            <span>
              <span className="text-[15px] text-ink-900">
                {freq.label}
                {disabled && <span className="ml-2 text-[13px] text-ink-500">(Pro)</span>}
              </span>
              <span className="mt-0.5 block text-[13px] text-ink-500">{freq.desc}</span>
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
