"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSettings } from "@/app/actions/settings";
import type { FormState } from "@/lib/form-state";

export function SettingsForm({ name, email }: { name: string; email: string }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(updateSettings, {});

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && <p role="alert" className="text-sm font-medium text-negative">{state.error}</p>}
      {state.success && (
        <p role="status" className="text-sm font-medium text-positive">
          {state.success}
        </p>
      )}
      <Input name="full_name" label="Nombre" defaultValue={name} placeholder="Tu nombre" />
      <Input name="email" label="Correo" defaultValue={email} disabled />
      <Button type="submit" loading={isPending} className="w-fit">
        Guardar cambios
      </Button>
    </form>
  );
}
