import { siteUrl as siteUrlFn } from "@/lib/site";
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
import { canUseTelegram, formatClp, PLANS, portfolioLimitsFor, trialDaysLeft } from "@/lib/plans";
import { isMyPortfolioEnabled } from "@/lib/portfolio-flags";
import { hasCurrentPortfolioConsent, portfolioAlertChannelsFor } from "@/lib/portfolio-consent";
import { referralsEnabled } from "@/lib/referrals";
import { isPaidPlan } from "@/lib/types";
import { aiEnabled } from "@/lib/ai-flags";
import { BRAND_WORDMARK } from "@/lib/brand";
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

const ALERT_FREQUENCY_LABELS: Record<string, string> = {
  realtime: "Tiempo real",
  daily: "Resumen diario",
  weekly: "Resumen semanal",
};

const ALERT_CHANNEL_LABELS: Record<string, string> = {
  email: "Por correo",
  telegram: "Por Telegram",
  both: "Correo y Telegram",
};

// Precios de lista: la fuente es `lib/plans`, nunca esta vista.
const PRO_MONTHLY_PRICE = `${formatClp(PLANS.pro.monthlyPrice)} CLP/mes`;
const PRO_ANNUAL_PRICE = `o ${formatClp(PLANS.pro.annualTotalPrice)} al año`;
const ELITE_MONTHLY_PRICE = `${formatClp(PLANS.elite.monthlyPrice)} CLP/mes`;

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

interface PlanTier {
  id: "free" | "pro" | "elite";
  name: string;
  price: string;
  priceNote: string;
  description: string;
  current: boolean;
  cta?: { href: string; label: string };
}

export default async function SettingsPage() {
  // Marca la ruta como dinámica (lee cookies de auth) bajo cacheComponents.
  await connection();
  const profile = await getProfile();
  if (!profile) return null;
  const isPro = isPaidPlan(profile.plan);
  // La IA solo se vende en el copy si hay clave y modelo configurados.
  const aiOn = aiEnabled();

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

  const planDescription =
    profile.plan === "elite"
      ? aiOn
        ? "Portafolios ilimitados, Fondos 13F institucionales, Radar de Consenso, asistente ilimitado y exportación CSV."
        : "Portafolios ilimitados, Fondos 13F institucionales, Radar de Consenso y exportación CSV."
      : profile.plan === "pro"
        ? aiOn
          ? "Hasta 15 portafolios, resúmenes AI completos y alertas en tiempo real."
          : "Hasta 15 portafolios y alertas en tiempo real."
        : "El plan gratuito solo incluye las carteras recomendadas de corredoras.";

  // Resumen ejecutivo: plan, prueba y alertas en una sola línea de lectura.
  const trialDays = trialDaysLeft(profile.trial_ends_at);
  const planSummaryNote = isPro
    ? activeSubscription
      ? activeSubscription.period === "anual"
        ? "Suscripción anual"
        : "Suscripción mensual"
      : "Suscripción activa"
    : trialDays && trialDays > 0
      ? `Prueba Pro · ${trialDays} ${trialDays === 1 ? "día" : "días"}`
      : "Sin costo mensual";

  const alertsSummary = ALERT_FREQUENCY_LABELS[profile.alert_frequency] ?? "Resumen diario";
  const alertsNote = profile.email_unsubscribed
    ? "Correos en pausa"
    : (ALERT_CHANNEL_LABELS[profile.alert_channel ?? "email"] ?? "Por correo");

  const planRank: Record<PlanTier["id"], number> = { free: 0, pro: 1, elite: 2 };
  const currentRank = planRank[profile.plan] ?? 0;

  // Comparativa: precios desde `lib/plans`, sin números escritos a mano.
  const tiers: PlanTier[] = [
    {
      id: "free",
      name: "Gratis",
      price: "$0",
      priceNote: "para siempre",
      description: aiOn
        ? "Carteras de corredoras · alertas diarias · 5 consultas diarias al asistente"
        : "Carteras de corredoras · alertas diarias",
      current: profile.plan === "free",
      cta: { href: "/upgrade?plan=pro", label: "Pasar a Pro" },
    },
    {
      id: "pro",
      name: "Pro",
      price: PRO_MONTHLY_PRICE,
      priceNote: PRO_ANNUAL_PRICE,
      description: aiOn
        ? "15 portafolios · tiempo real · resúmenes AI · 50 consultas semanales"
        : "15 portafolios · tiempo real",
      current: profile.plan === "pro",
      cta: { href: "/upgrade?plan=pro", label: "Pasar a Pro" },
    },
    {
      id: "elite",
      name: "Elite",
      price: ELITE_MONTHLY_PRICE,
      priceNote: "o plan anual con 20% de descuento",
      description: "Ilimitados · Fondos 13F y Soberanos · Radar de Consenso · exportación CSV",
      current: profile.plan === "elite",
      cta: { href: "/upgrade?plan=elite", label: "Pasar a Elite" },
    },
  ];

  // Referidos: apagado por defecto; sólo aparece con el flag y un código real
  // de la tabla `referral_codes` (la 009 lo genera al registrarse).
  if (referralResult.error) {
    console.warn("[reclu] referral_codes:", referralResult.error.message);
  }
  const referralCode = referralsEnabled()
    ? ((referralResult.data as { code: string } | null)?.code ?? null)
    : null;
  const siteUrl = siteUrlFn();

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
    <div className="flex flex-col gap-8 pb-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[32px]">
          Ajustes
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-ink-500">
          Tu cuenta, tu plan y las alertas que recibes. Cada bloque se guarda por
          separado.
        </p>
      </header>

      {/* Resumen ejecutivo de cuenta */}
      <section aria-labelledby="resumen-cuenta" className="flex flex-col gap-3">
        <h2 id="resumen-cuenta" className="text-[13px] font-normal leading-none text-ink-500">
          Resumen de tu cuenta
        </h2>
        <dl className="grid grid-cols-2 gap-px border-y border-ink-200 bg-ink-200 lg:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-1.5 bg-white p-4 sm:p-5">
            <dt className="text-[12px] leading-none text-ink-500">Correo</dt>
            <dd className="flex min-w-0 flex-col gap-0.5">
              <span className="break-all text-[14px] leading-snug text-ink-900">
                {profile.email}
              </span>
              <span className="text-[12px] leading-snug text-ink-500">
                Con el que inicias sesión
              </span>
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 bg-white p-4 sm:p-5">
            <dt className="text-[12px] leading-none text-ink-500">Plan</dt>
            <dd className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14px] leading-snug text-ink-900">{planName}</span>
              <span className="text-[12px] leading-snug text-ink-500">{planSummaryNote}</span>
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 bg-white p-4 sm:p-5">
            <dt className="text-[12px] leading-none text-ink-500">Alertas</dt>
            <dd className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14px] leading-snug text-ink-900">{alertsSummary}</span>
              <span className="text-[12px] leading-snug text-ink-500">{alertsNote}</span>
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-2 bg-white p-4 sm:p-5">
            <dt className="text-[12px] leading-none text-ink-500">Suscripción</dt>
            <dd className="flex flex-col gap-2">
              <span className="text-[12px] leading-snug text-ink-500">
                {isPro ? "Cobros, comprobantes y cancelación" : `Desde ${PRO_MONTHLY_PRICE}`}
              </span>
              {isPro ? (
                <ButtonLink href="#plan" size="sm" variant="outline" className="w-fit">
                  Gestionar suscripción
                </ButtonLink>
              ) : (
                <ButtonLink href="/upgrade?plan=pro" size="sm" className="w-fit">
                  Pasar a Pro
                </ButtonLink>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] xl:gap-12">
        <SettingsSubnav
          sections={DEFAULT_SETTINGS_SECTIONS.filter((s) => s.href !== "#referidos" || referralsEnabled())}
        />

        <div className="flex min-w-0 max-w-4xl flex-col gap-6">
          {/* Cuenta */}
          <div id="cuenta" className="scroll-mt-28">
            <Card>
              <CardHeader>
                <CardTitle>Perfil</CardTitle>
                <CardDescription>Nombre y correo de tu cuenta en fraccion.si.</CardDescription>
              </CardHeader>
              <CardContent>
                <SettingsForm name={profile.full_name ?? ""} email={profile.email} />
              </CardContent>
            </Card>
          </div>

          {/* Plan */}
          <div id="plan" className="scroll-mt-28">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <CardTitle>Tu plan</CardTitle>
                  <p className="text-[12px] text-ink-500">
                    Plan actual: <span className="text-ink-900">{planName}</span>
                  </p>
                </div>
                <CardDescription>{planDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-5">
                  {/* Comparativa de los tres niveles, solo filetes */}
                  <div className="border-t border-ink-200">
                    {tiers.map((tier) => {
                      const canUpgrade = planRank[tier.id] > currentRank;
                      return (
                        <div
                          key={tier.id}
                          className="grid grid-cols-1 gap-2 border-b border-ink-200 py-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center sm:gap-6"
                        >
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-medium text-ink-900">
                              {tier.name}
                              {tier.current && (
                                <span className="text-[12px] font-normal text-ink-500">Tu plan</span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500">
                              {tier.description}
                            </p>
                          </div>
                          <div className="sm:text-right">
                            <p className="text-[15px] tabular-nums leading-snug text-ink-900">
                              {tier.price}
                            </p>
                            <p className="text-[12px] leading-snug text-ink-500">{tier.priceNote}</p>
                          </div>
                          <div className="sm:justify-self-end">
                            {canUpgrade && tier.cta ? (
                              <ButtonLink href={tier.cta.href} size="sm" className="w-fit">
                                {tier.cta.label}
                              </ButtonLink>
                            ) : tier.current ? (
                              <span className="text-[12px] text-ink-500">Activo</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[12px] leading-relaxed text-ink-500">
                    Precios en pesos chilenos. Pagos por Mercado Pago. Sin permanencia:
                    si cancelas, mantienes el acceso hasta el final del período pagado.
                  </p>

                  {!isPro && (
                    <ButtonLink href="/upgrade?plan=pro" variant="outline" size="sm" className="w-fit">
                      Ver planes y precios
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
                      ] ?? BRAND_WORDMARK}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Frecuencia de alertas */}
          <div id="notificaciones" className="scroll-mt-28">
            <Card>
              <CardHeader>
                <CardTitle>Frecuencia de alertas</CardTitle>
                <CardDescription>
                  Cada cuánto te escribimos. Las alertas siempre nacen de datos públicos.
                </CardDescription>
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

          {referralCode && (
            <div id="referidos" className="scroll-mt-28">
              <ReferralCard code={referralCode} siteUrl={siteUrl} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
