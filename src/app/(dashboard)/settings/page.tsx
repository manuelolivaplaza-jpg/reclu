import { connection } from "next/server";
import { getProfile } from "@/lib/queries";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";
import { SettingsForm } from "@/components/settings-form";
import { AlertFrequencyForm } from "@/components/alert-frequency-form";

export const metadata = { title: "Ajustes" };
// Auth-gated route: reads cookies at request time — never prerendered.
export const instant = false;

export default async function SettingsPage() {
  // Mark this route as dynamic (reads auth cookies) under cacheComponents.
  await connection();
  const profile = await getProfile();
  if (!profile) return null;
  const isPro = profile.plan === "pro";

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          Ajustes
        </h1>
        <p className="mt-1.5 text-ink-600">Administra tu perfil y preferencias de alertas.</p>
      </div>

      {/* Plan card */}
      <Card className={profile.plan === "pro" ? "border-brand-300 bg-brand-50/40" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Tu plan</CardTitle>
            <Badge variant={profile.plan === "pro" ? "brand" : "outline"}>
              {profile.plan === "pro" ? (
                <>
                  <Crown className="size-3" />
                  Pro
                </>
              ) : (
                "Gratis"
              )}
            </Badge>
          </div>
          <CardDescription>
            {profile.plan === "pro"
              ? "Disfrutas de portafolios ilimitados, resúmenes AI completos y alertas en tiempo real."
              : "El plan gratuito permite seguir hasta 2 portafolios."}
          </CardDescription>
        </CardHeader>
        {profile.plan !== "pro" && (
          <CardContent>
            <a
              href="/#precios"
              className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Actualizar a Pro
            </a>
          </CardContent>
        )}
      </Card>

      {/* Profile form */}
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Tu información pública en reclu.cl.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm name={profile.full_name ?? ""} email={profile.email} />
        </CardContent>
      </Card>

      {/* Alert frequency */}
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
