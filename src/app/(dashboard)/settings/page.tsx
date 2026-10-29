import { connection } from "next/server";
import { getProfile } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SettingsForm } from "@/components/settings-form";
import { AlertFrequencyForm } from "@/components/alert-frequency-form";
import { AlertRulesForm } from "@/components/alert-rules-form";
import { TradeAlertPrefsForm } from "@/components/trade-alert-prefs-form";
import { mergeTradeAlertPrefs } from "@/lib/trade-alert-prefs";
import { TelegramConnect } from "@/components/telegram-connect";
import { ReferralCard } from "@/components/referral-card";
import { BillingStatus } from "@/components/billing-status";
import { LegalNotice } from "@/components/legal/legal-notice";
import { PortfolioConsent } from "@/components/portfolio-consent";
import { PortfolioAlertSettings } from "@/components/portfolio-alert-settings";
import { DeletePortfolioForm } from "@/components/delete-portfolio-form";
import { alertRuleLimitFor, parseAlertRuleRows } from "@/lib/alert-rules";
import { canUseTelegram, portfolioLimitsFor } from "@/lib/plans";
import { isMyPortfolioEnabled } from "@/lib/portfolio-flags";
import { hasCurrentPortfolioConsent, portfolioAlertChannelsFor } from "@/lib/portfolio-consent";
import { referralsEnabled } from "@/lib/referrals";
import { isPaidPlan } from "@/lib/types";
import { SettingsSubnav, DEFAULT_SETTINGS_SECTIONS } from "@/components/settings/settings-subnav";

export const metadata = { title: "Ajustes" };
// Ruta protegida por auth: lee cookies por request — nunca se prerenderiza.
export const instant = false;

/** Etiquetas de proveedores para la UI de Ajustes. */
const SUBSCRIPTION_PROVIDER_LABELS: Record<string, string> = {
  flow: "Flow",
  mercadopago: "Mercado Pago",
  mock: "modo prueba",
};

interface SubscriptionRow {
  plan: string;
  period: string;
  status: string;
  provider: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface PortfolioSettingsRow {
  auto_alerts: boolean;
  min_relevance: number | string;
  alert_channel: string;
  consent_at: string | null;
  consent_version: string | null;
}

export default async function SettingsPage() {
  // Marca la ruta como dinámica (lee cookies de auth) bajo cacheComponents.
  await connection();
  const profile = await getProfile();
  if (!profile) return null;
  const isPro = isPaidPlan(profile.plan);

  // Suscripción y reglas son lecturas independientes (RLS: solo lo propio).
  const supabase = await createClient();
  const myPortfolioEnabled = isMyPortfolioEnabled();
  const subscriptionPromise = isPro
    ? supabase
        .from("subscriptions")
        .select("plan, period, status, provider, current_period_end, cancel_at_period_end")
        .eq("user_id", profile.id)
        .in("status", ["active", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null });
  // D31: portafolios seguidos + preferencias de compra/venta (RLS: solo lo propio).
  const tradePrefsPromise = (async () => {
    const { data: follows } = await supabase
      .from("follows")
      .select("portfolio:portfolios(id, slug, name)")
      .eq("user_id", profile.id);
    const followed = ((follows ?? []) as unknown as { portfolio: { id: string; slug: string; name: string } | null }[])
      .map((f) => f.portfolio)
      .filter((p): p is { id: string; slug: string; name: string } => !!p);
    const { data: prefRows, error } = await supabase
      .from("follow_alert_prefs")
      .select("portfolio_id, email_buys, email_sells")
      .eq("user_id", profile.id);
    return { prefs: mergeTradeAlertPrefs(followed, prefRows ?? []), unavailable: !!error };
  })();
  const rulesPromise = supabase
    .from("alert_rules")
    .select("id, kind, value, channel, active")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });
  // Código propio de referidos: tabla de la 009, RLS "own referral code read".
  const referralCodePromise = referralsEnabled()
    ? supabase
        .from("referral_codes")
        .select("code")
        .eq("user_id", profile.id)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  // F75: preferencias y consentimiento de Mi portafolio, solo con el flag.
  const portfolioSettingsPromise = myPortfolioEnabled
    ? supabase
        .from("user_portfolio_settings")
        .select("auto_alerts, min_relevance, alert_channel, consent_at, consent_version")
        .eq("user_id", profile.id)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [subscriptionResult, rulesResult, referralResult, portfolioResult, tradePrefs] = await Promise.all([
    subscriptionPromise,
    rulesPromise,
    referralCodePromise,
    portfolioSettingsPromise,
    tradePrefsPromise,
  ]);
  const activeSubscription = (subscriptionResult.data as SubscriptionRow | null) ?? null;
  if (rulesResult.error) {
    console.warn("[reclu] alert_rules:", rulesResult.error.message);
  }
  const alertRules = parseAlertRuleRows(rulesResult.data);
  const rulesUnavailable = rulesResult.error
    ? "Todavía no podemos mostrar tus reglas. Inténtalo de nuevo en unos minutos."
    : null;

  const planName =
    profile.plan === "elite" ? "Elite" : profile.plan === "pro" ? "Pro" : "Gratis";

  // Referidos: apagado por defecto; sólo aparece con el flag y un código real
  // de la tabla `referral_codes` (la 009 lo genera al registrarse).
  if (referralResult.error) {
    console.warn("[reclu] referral_codes:", referralResult.error.message);
  }
  const referralCode = referralsEnabled()
    ? ((referralResult.data as { code: string } | null)?.code ?? null)
    : null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://reclu.cl";

  // F75: datos de Mi portafolio. Si la tabla aún no existe (migración 050 sin
  // aplicar) la página sigue funcionando y las acciones fallan con elegancia.
  if (portfolioResult.error) {
    console.warn("[reclu] user_portfolio_settings:", portfolioResult.error.message);
  }
  const portfolioRow = (portfolioResult.data as PortfolioSettingsRow | null) ?? null;
  const portfolioLimits = portfolioLimitsFor(profile.plan, profile.trial_ends_at);
  const portfolioChannels = portfolioAlertChannelsFor(
    profile.plan,
    profile.trial_ends_at,
  );
  const aiModel = (process.env.OPENROUTER_MODEL ?? "").trim();
  const rawMinRelevance = Number(portfolioRow?.min_relevance ?? 0.5);
  const portfolioMinRelevance = Number.isFinite(rawMinRelevance) ? rawMinRelevance : 0.5;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-[28px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[32px]">
          Ajustes
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-500">
          Administra tu perfil y preferencias de alertas.
        </p>
      </div>

      <SettingsSubnav
        sections={DEFAULT_SETTINGS_SECTIONS.filter((s) => s.href !== "#referidos" || referralsEnabled())}
      />

      {/* Plan */}
      <div id="plan" className="scroll-mt-28">
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
                  {!tier.current && !tier.name.startsWith("Gratis") && (
                    <ButtonLink
                      href={tier.name.startsWith("Elite") ? "/upgrade?plan=elite" : "/upgrade?plan=pro"}
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
              <ButtonLink href="/upgrade?plan=pro" variant="outline" className="w-fit">
                Comparar planes
              </ButtonLink>
            )}
            {isPro && (
              <BillingStatus
                plan={activeSubscription?.plan === "elite" ? "elite" : "pro"}
                period={(activeSubscription?.period as "mensual" | "anual") ?? "mensual"}
                status={activeSubscription?.status ?? "active"}
                currentPeriodEnd={activeSubscription?.current_period_end ?? null}
                cancelAtPeriodEnd={Boolean(activeSubscription?.cancel_at_period_end)}
                providerLabel={SUBSCRIPTION_PROVIDER_LABELS[
                  activeSubscription?.provider ?? "mock"
                ] ?? "reclu"}
              />
            )}
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Perfil */}
      <div id="cuenta" className="scroll-mt-28">
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Tu información pública en reclu.cl.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm name={profile.full_name ?? ""} email={profile.email} />
        </CardContent>
      </Card>
      </div>

      {/* Frecuencia de alertas */}
      <div id="notificaciones" className="scroll-mt-28">
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

      <div id="telegram" className="scroll-mt-28">
        <TelegramConnect profile={profile} />
      </div>

      {myPortfolioEnabled && (
        <>
          {/* F75: consentimiento explícito (Ley 21.719). Va antes de las
              alertas porque sin consentimiento no se tratan las tenencias. */}
          <Card>
            <CardHeader>
              <CardTitle>Mi portafolio: consentimiento</CardTitle>
              <CardDescription>
                Tratamos tus tenencias como datos financieros sensibles. Lee la
                finalidad antes de aceptar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PortfolioConsent
                consentAt={portfolioRow?.consent_at ?? null}
                consentVersion={portfolioRow?.consent_version ?? null}
                model={aiModel}
              />
            </CardContent>
          </Card>

          {/* F75: alertas automáticas, apagadas por defecto y según plan. */}
          <Card>
            <CardHeader>
              <CardTitle>Alertas automáticas de mi cartera</CardTitle>
              <CardDescription>
                Avisos cuando una noticia pública supere tu umbral de relevancia.
                Este interruptor parte apagado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PortfolioAlertSettings
                autoAlerts={Boolean(portfolioRow?.auto_alerts)}
                minRelevance={portfolioMinRelevance}
                alertChannel={portfolioRow?.alert_channel ?? "email"}
                planAutoAlerts={portfolioLimits.autoAlerts}
                allowedChannels={[...portfolioChannels]}
                hasConsent={hasCurrentPortfolioConsent(
                  portfolioRow?.consent_at ?? null,
                  portfolioRow?.consent_version ?? null,
                )}
              />
            </CardContent>
          </Card>

          {/* F75: derecho de supresión. Solo con el flag encendido. */}
          <Card>
            <CardHeader>
              <CardTitle>Borrar mi cartera</CardTitle>
              <CardDescription>
                Elimina tus posiciones, el consentimiento y estos ajustes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeletePortfolioForm />
            </CardContent>
          </Card>
        </>
      )}

      {referralCode && <div id="referidos" className="scroll-mt-28">
<ReferralCard code={referralCode} siteUrl={siteUrl} />
</div>}

      {/* D31: email de compras y ventas por portafolio seguido. */}
      <Card>
        <CardHeader>
          <CardTitle>Compras y ventas de lo que sigues</CardTitle>
          <CardDescription>
            Te avisamos por email cuando un portafolio que sigues agrega una posición nueva (compra)
            o cierra una (venta), según el último dato publicado de su fuente. Elige qué avisos quieres en cada uno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TradeAlertPrefsForm prefs={tradePrefs.prefs} unavailable={tradePrefs.unavailable} />
        </CardContent>
      </Card>

      {/* Reglas a medida. No esconde datos públicos: solo elige el aviso. */}
      <Card>
        <CardHeader>
          <CardTitle>Mis reglas</CardTitle>
          <CardDescription>
            Avisos cuando una fuente pública cumple un criterio que tú defines:
            un símbolo en cualquier fuente, un portafolio, una fuente o un monto
            en dólares. Las declaraciones de funcionarios de Estados Unidos siguen
            siendo públicas; la regla solo elige de qué te avisamos. Guardamos
            únicamente ese criterio, para enviarte el aviso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6">
            <AlertRulesForm
              rules={alertRules}
              limit={alertRuleLimitFor(profile.plan, profile.trial_ends_at)}
              canUseTelegram={canUseTelegram(profile.plan, profile.trial_ends_at)}
              unavailable={rulesUnavailable}
            />
            <LegalNotice kind="fintec" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
