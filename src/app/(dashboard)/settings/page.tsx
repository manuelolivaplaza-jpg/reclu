import { connection } from "next/server";
import { getProfile } from "@/lib/queries";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SettingsForm } from "@/components/settings-form";
import { AlertFrequencyForm } from "@/components/alert-frequency-form";
import { isPaidPlan } from "@/lib/types";

export const metadata = { title: "Ajustes" };
// Ruta protegida por auth: lee cookies por request — nunca se prerenderiza.
export const instant = false;

export default async function SettingsPage() {
  // Marca la ruta como dinámica (lee cookies de auth) bajo cacheComponents.
  await connection();
  const profile = await getProfile();
  if (!profile) return null;
  const isPro = isPaidPlan(profile.plan);
  const planName =
    profile.plan === "elite" ? "Elite" : profile.plan === "pro" ? "Pro" : "Gratis";

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
            <span className="text-[13px] text-ink-900">{planName}</span>
          </div>
          <CardDescription>
            {profile.plan === "elite"
              ? "Portafolios ilimitados, Fondos 13F institucionales, Radar de Consenso, asistente ilimitado y exportación CSV."
              : profile.plan === "pro"
                ? "Hasta 15 portafolios, resúmenes AI completos y alertas en tiempo real."
                : "El plan gratuito permite seguir hasta 2 portafolios."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6">
            {/* Comparativa de los 3 niveles — filetes, sin color */}
            <div className="border-t border-ink-200">
              {[
                {
                  name: "Gratis — $0",
                  desc: "2 portafolios · alertas diarias · 2 consultas de prueba al asistente",
                  current: profile.plan === "free",
                },
                {
                  name: "Pro — $12.990 CLP/mes",
                  desc: "15 portafolios · tiempo real · resúmenes AI · 50 consultas semanales",
                  current: profile.plan === "pro",
                },
                {
                  name: "Elite — $16.990 CLP/mes",
                  desc: "Ilimitados · Fondos 13F y Soberanos · Radar de Consenso · exportación CSV",
                  current: profile.plan === "elite",
                },
              ].map((tier) => (
                <div
                  key={tier.name}
                  className="flex flex-col gap-1 border-b border-ink-200 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-[15px] font-medium text-ink-900">
                      {tier.name}
                      {tier.current && (
                        <span className="ml-2 text-[13px] font-normal text-ink-500">
                          (tu plan)
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[13px] text-ink-500">{tier.desc}</p>
                  </div>
                  {!tier.current && (
                    <ButtonLink
                      href={tier.name.startsWith("Elite") ? "/signup?plan=elite" : "/signup?plan=pro"}
                      size="sm"
                      className="shrink-0"
                    >
                      {tier.name.startsWith("Elite") ? "Pasar a Elite" : "Pasar a Pro"}
                    </ButtonLink>
                  )}
                </div>
              ))}
            </div>
            {!isPro && (
              <ButtonLink href="/#precios" variant="outline" className="w-fit">
                Comparar planes
              </ButtonLink>
            )}
          </div>
        </CardContent>
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
