import { connection } from "next/server";
import { getProfile } from "@/lib/queries";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SettingsForm } from "@/components/settings-form";
import { AlertFrequencyForm } from "@/components/alert-frequency-form";

export const metadata = { title: "Ajustes" };
// Ruta protegida por auth: lee cookies por request — nunca se prerenderiza.
export const instant = false;

export default async function SettingsPage() {
  // Marca la ruta como dinámica (lee cookies de auth) bajo cacheComponents.
  await connection();
  const profile = await getProfile();
  if (!profile) return null;
  const isPro = profile.plan === "pro";

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-[28px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[32px]">
          Ajustes
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-500">
          Administra tu perfil y preferencias de alertas.
        </p>
      </div>

      {/* Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Tu plan</CardTitle>
            <span className="text-[13px] text-ink-900">{isPro ? "Pro" : "Gratis"}</span>
          </div>
          <CardDescription>
            {isPro
              ? "Disfrutas de portafolios ilimitados, resúmenes AI completos y alertas en tiempo real."
              : "El plan gratuito permite seguir hasta 2 portafolios."}
          </CardDescription>
        </CardHeader>
        {!isPro && (
          <CardContent>
            <ButtonLink href="/#precios">Actualizar a Pro</ButtonLink>
          </CardContent>
        )}
      </Card>

      {/* Perfil */}
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Tu información pública en reclu.cl.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm name={profile.full_name ?? ""} email={profile.email} />
        </CardContent>
      </Card>

      {/* Frecuencia de alertas */}
      <Card>
        <CardHeader>
          <CardTitle>Frecuencia de alertas</CardTitle>
          <CardDescription>Con qué frecuencia quieres recibir correos.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertFrequencyForm current={profile.alert_frequency} isPro={isPro} />
        </CardContent>
      </Card>
    </div>
  );
}
