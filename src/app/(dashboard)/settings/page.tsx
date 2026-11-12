import { siteUrl as siteUrlFn } from "@/lib/site";
import { connection } from "next/server";
import Link from "next/link";
import { getProfile } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
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
import { SettingsSubnav } from "@/components/settings/settings-subnav";

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
const PRO_MONTHLY = formatClp(PLANS.pro.monthlyPrice);
const PRO_ANNUAL = formatClp(PLANS.pro.annualTotalPrice);
const ELITE_MONTHLY = formatClp(PLANS.elite.monthlyPrice);
const ELITE_ANNUAL = formatClp(PLANS.elite.annualTotalPrice);

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
  /** Precio en pesos, ya formateado. */
  price: string;
  /** Unidad del precio ("CLP / mes"); vacía en el plan gratuito. */
  unit: string;
  /** Segunda línea del precio ("o $99.900 al año"). */
  note: string;
  description: string;
  current: boolean;
  cta?: { href: string; label: string };
}

/**
 * Bloque de Ajustes: título, descripción de 13px y contenido separado por un
 * filete de 1px. Radio 0 y sin sombra: la jerarquía la hace la tipografía.
 */
function SettingsSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-28">
      <Card>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0">
            <h2
              id={`${id}-titulo`}
              className="text-[17px] font-medium leading-snug tracking-[-0.02em] text-ink-900"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-500">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        <div className="border-t border-line p-5 sm:p-6">{children}</div>
      </Card>
    </section>
  );
}

export default async function SettingsPage() {
  // Marca la ruta como dinámica (lee cookies de auth) bajo cacheComponents.
  await connection();
  const profile = await getProfile();
  if (!profile) {
    return (
      <div className="flex max-w-xl flex-col gap-4 pb-8">
        <h1 className="text-[32px] font-medium leading-[1.03] tracking-[-0.04em] text-ink-900 sm:text-[40px]">
          Ajustes
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-500">
          No pudimos cargar tu perfil. Vuelve a intentarlo en unos minutos.
        </p>
        <ButtonLink href="/settings" variant="outline" size="sm" className="w-fit">
          Reintentar
        </ButtonLink>
      </div>
    );
  }
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
  const subscriptionError = "error" in subscriptionResult ? subscriptionResult.error : null;
  if (subscriptionError) {
    console.warn("[reclu] subscriptions:", subscriptionError.message);
  }
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
      : "Sin renovación registrada"
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
      price: formatClp(PLANS.free.monthlyPrice),
      unit: "",
      note: "Para siempre",
      description: aiOn
        ? "Carteras de corredoras · alertas diarias · 5 consultas diarias al asistente"
        : "Carteras de corredoras · alertas diarias",
      current: profile.plan === "free",
    },
    {
      id: "pro",
      name: "Pro",
      price: PRO_MONTHLY,
      unit: "CLP / mes",
      note: `o ${PRO_ANNUAL} al año`,
      description: aiOn
        ? "15 portafolios · tiempo real · resúmenes AI · 50 consultas semanales"
        : "15 portafolios · tiempo real",
      current: profile.plan === "pro",
      cta: { href: "/upgrade?plan=pro", label: "Pasar a Pro" },
    },
    {
      id: "elite",
      name: "Elite",
      price: ELITE_MONTHLY,
      unit: "CLP / mes",
      note: `o ${ELITE_ANNUAL} al año`,
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
      <header className="border-b border-line pb-6">
        <p className="label-line">Cuenta y alertas</p>
        <h1 className="mt-3 text-[32px] font-medium leading-[1.03] tracking-[-0.04em] text-ink-900 sm:text-[40px]">
          Ajustes
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-500">
          Tu cuenta, tu plan y las alertas que recibes. Cada bloque se guarda por
          separado.
        </p>
      </header>

      {/* Resumen de la cuenta: cuatro lecturas, separadas por filetes */}
      <section aria-labelledby="resumen-cuenta" className="flex flex-col gap-3">
        <h2 id="resumen-cuenta" className="label-line">
          Resumen de tu cuenta
        </h2>
        <dl className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-1.5 bg-app-card p-4 sm:p-5">
            <dt className="label-line">Correo</dt>
            <dd className="flex min-w-0 flex-col gap-0.5">
              <span className="break-all text-[14px] leading-snug text-ink-900">
                {profile.email}
              </span>
              <span className="text-[13px] leading-snug text-ink-500">
                Con el que inicias sesión
              </span>
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 bg-app-card p-4 sm:p-5">
            <dt className="label-line">Plan</dt>
            <dd className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14px] leading-snug text-ink-900">{planName}</span>
              <span className="text-[13px] leading-snug text-ink-500">{planSummaryNote}</span>
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 bg-app-card p-4 sm:p-5">
            <dt className="label-line">Alertas</dt>
            <dd className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14px] leading-snug text-ink-900">{alertsSummary}</span>
              <span className="text-[13px] leading-snug text-ink-500">{alertsNote}</span>
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-2 bg-app-card p-4 sm:p-5">
            <dt className="label-line">Suscripción</dt>
            <dd className="flex flex-col gap-2">
              {isPro ? (
                <>
                  <span className="text-[13px] leading-snug text-ink-500">
                    Estado del cobro y cancelación
                  </span>
                  <a
                    href="#plan"
                    className="w-fit text-[13px] font-medium text-ink-900 underline underline-offset-4 hover:opacity-60"
                  >
                    Gestionar suscripción
                  </a>
                </>
              ) : (
                <>
                  <span className="text-[13px] leading-snug text-ink-500">
                    Desde <span className="num text-ink-900">{PRO_MONTHLY}</span> CLP / mes
                  </span>
                  <ButtonLink href="/upgrade?plan=pro" size="sm" className="w-fit">
                    Pasar a Pro
                  </ButtonLink>
                </>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] xl:gap-12">
        <SettingsSubnav showReferrals={Boolean(referralCode)} />

        <div className="flex min-w-0 max-w-4xl flex-col gap-5">
          <SettingsSection
            id="cuenta"
            title="Cuenta"
            description="Nombre y correo de tu cuenta en fraccion.si."
          >
            <SettingsForm name={profile.full_name ?? ""} email={profile.email} />
          </SettingsSection>

          <SettingsSection
            id="plan"
            title="Tu plan"
            description={planDescription}
            action={
              <p className="text-[13px] leading-snug text-ink-500">
                Plan actual: <span className="text-ink-900">{planName}</span>
              </p>
            }
          >
            <div className="flex flex-col gap-5">
              {/* Comparativa de los tres niveles, solo filetes */}
              <div className="border-t border-line">
                {tiers.map((tier) => {
                  const canUpgrade = planRank[tier.id] > currentRank;
                  return (
                    <div
                      key={tier.id}
                      className="grid grid-cols-1 gap-3 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_9.5rem_auto] sm:items-center sm:gap-6"
                    >
                      <div className="min-w-0">
                        <p className="text-[15px] font-medium leading-snug text-ink-900">
                          {tier.name}
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
                          {tier.description}
                        </p>
                      </div>
                      <div className="sm:text-right">
                        <p className="num text-[15px] leading-snug text-ink-900">
                          {tier.price}
                          {tier.unit ? (
                            <span className="ml-1 text-[13px] font-normal tracking-normal text-ink-500">
                              {tier.unit}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[13px] leading-snug text-ink-500">
                          {tier.note}
                        </p>
                      </div>
                      <div className="sm:justify-self-end">
                        {canUpgrade && tier.cta ? (
                          <ButtonLink
                            href={tier.cta.href}
                            size="sm"
                            variant="outline"
                            className="w-fit"
                          >
                            {tier.cta.label}
                          </ButtonLink>
                        ) : tier.current ? (
                          <span className="text-[13px] text-ink-500">Activo</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <p className="max-w-2xl text-[13px] leading-relaxed text-ink-500">
                  Precios en pesos chilenos. Pagos con tarjeta, transferencia bancaria
                  o Mercado Pago, sin permanencia: si cancelas, mantienes el acceso
                  hasta el final del período pagado.
                </p>
                <p className="max-w-2xl text-[13px] leading-relaxed text-ink-500">
                  Seguir portafolios y ver sus posiciones de fondos, ETF y políticos
                  requiere un plan de pago. Las carteras recomendadas de corredoras se
                  ven completas sin costo.
                </p>
                <Link
                  href="/upgrade"
                  className="w-fit text-[13px] font-medium text-ink-900 underline underline-offset-4 hover:opacity-60"
                >
                  Ver todos los planes
                </Link>
              </div>

              {isPro &&
                (activeSubscription ? (
                  <BillingStatus
                    plan={activeSubscription.plan === "elite" ? "elite" : "pro"}
                    period={(activeSubscription.period as "mensual" | "anual") ?? "mensual"}
                    status={activeSubscription.status}
                    currentPeriodEnd={activeSubscription.current_period_end ?? null}
                    cancelAtPeriodEnd={Boolean(activeSubscription.cancel_at_period_end)}
                    providerLabel={
                      SUBSCRIPTION_PROVIDER_LABELS[activeSubscription.provider] ??
                      "tu proveedor de pagos"
                    }
                  />
                ) : (
                  <p className="max-w-2xl border-t border-line pt-4 text-[13px] leading-relaxed text-ink-500">
                    No encontramos una suscripción con cobros activos en esta cuenta.
                    Si necesitas un comprobante o reactivar el cobro, escríbenos a{" "}
                    <a
                      href="mailto:hola@fraccion.si"
                      className="text-ink-900 underline underline-offset-4"
                    >
                      hola@fraccion.si
                    </a>
                    .
                  </p>
                ))}
            </div>
          </SettingsSection>

          <SettingsSection
            id="notificaciones"
            title="Frecuencia de alertas"
            description="Cada cuánto te escribimos. Las alertas siempre nacen de datos públicos."
          >
            <AlertFrequencyForm current={profile.alert_frequency} isPro={isPro} />
          </SettingsSection>

          {/* Telegram trae su propio panel: aquí solo se ancla la sección. */}
          <section id="telegram" aria-label="Telegram" className="scroll-mt-28">
            <TelegramConnect profile={profile} />
          </section>

          {myPortfolioEnabled && (
            <>
              {/* F75: consentimiento explícito (Ley 21.719). Va antes de las
                  alertas porque sin consentimiento no se tratan las tenencias. */}
              <SettingsSection
                id="mi-cartera-consentimiento"
                title="Mi portafolio: consentimiento"
                description="Tratamos tus tenencias como datos financieros sensibles. Lee la finalidad antes de aceptar."
              >
                <PortfolioConsent
                  consentAt={portfolioRow?.consent_at ?? null}
                  consentVersion={portfolioRow?.consent_version ?? null}
                  model={aiModel}
                />
              </SettingsSection>

              {/* F75: alertas automáticas, apagadas por defecto y según plan. */}
              <SettingsSection
                id="mi-cartera-alertas"
                title="Alertas automáticas de mi cartera"
                description="Avisos cuando una noticia pública supera tu umbral de relevancia."
              >
                {portfolioResult.error ? (
                  <p className="mb-4 text-[13px] leading-relaxed text-ink-500">
                    No pudimos leer tus preferencias guardadas. Lo que ves corresponde
                    a la configuración por defecto.
                  </p>
                ) : null}
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
              </SettingsSection>

              {/* F75: derecho de supresión. Solo con el flag encendido. */}
              <SettingsSection
                id="mi-cartera-borrar"
                title="Borrar mi cartera"
                description="Elimina tus posiciones, el consentimiento y estos ajustes."
              >
                <DeletePortfolioForm />
              </SettingsSection>
            </>
          )}

          {/* D31: email de compras y ventas por portafolio seguido. */}
          <SettingsSection
            id="compras-ventas"
            title="Compras y ventas de lo que sigues"
            description="Te avisamos por correo cuando un portafolio que sigues agrega una posición nueva (compra) o cierra una (venta), según el último dato publicado de su fuente. Eliges qué avisos recibir en cada uno."
          >
            <TradeAlertPrefsForm prefs={tradePrefs.prefs} unavailable={tradePrefs.unavailable} />
          </SettingsSection>

          {/* Reglas a medida. No esconde datos públicos: solo elige el aviso. */}
          <SettingsSection
            id="reglas"
            title="Mis reglas"
            description="Avisos cuando una fuente pública cumple un criterio que defines: un símbolo, un portafolio, una fuente o un monto en dólares. Las declaraciones de funcionarios de Estados Unidos siguen siendo públicas; la regla solo elige de qué te avisamos y guardamos únicamente ese criterio."
          >
            <AlertRulesForm
              rules={alertRules}
              limit={alertRuleLimitFor(profile.plan, profile.trial_ends_at)}
              canUseTelegram={canUseTelegram(profile.plan, profile.trial_ends_at)}
              unavailable={rulesUnavailable}
            />
          </SettingsSection>

          {referralCode && (
            <section id="referidos" aria-label="Referidos" className="scroll-mt-28">
              <ReferralCard code={referralCode} siteUrl={siteUrl} />
            </section>
          )}

          <LegalNotice kind="fintec" />
        </div>
      </div>
    </div>
  );
}
