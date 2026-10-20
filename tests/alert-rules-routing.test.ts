import { describe, expect, it } from "vitest";
import { ruleMatches, type AlertMatchInput, type AlertRuleChannel } from "@/lib/alert-rules";
import { routeAlert } from "@/lib/alert-routing";

/**
 * Entrega de alertas por reglas a medida (F40) en send-alerts.
 *
 * Espeja `routeRule` y el armado de buckets de
 * `supabase/functions/send-alerts/index.ts`: la edge Deno no puede importar
 * desde `src/`, así que copia la lógica. Aquí NO se duplica el match puro:
 * se usa el `ruleMatches` real de `src/lib/alert-rules.ts` y el `routeAlert`
 * real de `src/lib/alert-routing.ts`, y solo se refleja el enrutamiento por
 * canal de la regla y la deduplicación entre follows y reglas.
 */

type Mode = "instant" | "daily" | "weekly";

interface ProfileRoute {
  plan: string;
  trial_ends_at?: string | null;
  alert_frequency: string;
  alert_channel?: string | null;
  email_unsubscribed?: boolean | null;
  telegram_chat_id?: string | null;
  weekly_digest?: boolean | null;
}

interface AlertLike {
  id: string;
  portfolio_id: string;
  title: string;
  payload?: Record<string, unknown> | null;
  portfolio: { id: string; slug: string; name: string; source?: string | null };
}

interface RuleLike {
  user_id: string;
  kind: "ticker" | "portfolio" | "source" | "min_amount";
  value: string;
  channel: AlertRuleChannel;
  active?: boolean;
  profile: ProfileRoute;
}

interface FollowLike {
  user_id: string;
  portfolio_id: string;
  profile: ProfileRoute;
}

interface Delivery {
  userId: string;
  alertId: string;
  email: boolean;
  telegram: boolean;
}

function isPaidPlan(plan?: string | null): boolean {
  return plan === "pro" || plan === "elite";
}

function isTrialPro(plan?: string | null, trialEndsAt?: string | null): boolean {
  if (isPaidPlan(plan) || typeof trialEndsAt !== "string" || trialEndsAt.length === 0) return false;
  const ends = Date.parse(trialEndsAt);
  return Number.isFinite(ends) && ends > Date.now();
}

function canUseTelegram(profile: ProfileRoute): boolean {
  return isPaidPlan(profile.plan) || isTrialPro(profile.plan, profile.trial_ends_at);
}

function normalizeFrequency(profile: ProfileRoute): string {
  const wanted = ["realtime", "daily", "weekly"].includes(profile.alert_frequency)
    ? profile.alert_frequency
    : "daily";
  if (wanted === "realtime" && !canUseTelegram(profile)) return "daily";
  return wanted;
}

/**
 * Espejo de `routeRule` de la edge: el canal lo elige la regla, la frecuencia
 * y la baja las decide el perfil. Sin Telegram disponible una regla `telegram`
 * cae a correo; `both` conserva solo el correo. El semanal entra al correo
 * solo si el perfil acepta el resumen (`weekly_digest`) y no está dado de baja;
 * Telegram nunca va en el semanal.
 */
function routeRule(
  profile: ProfileRoute,
  ruleChannel: string,
  mode: Mode,
): { email: boolean; telegram: boolean } {
  if (mode === "weekly") {
    const weeklyOk = profile.weekly_digest !== false;
    return { email: weeklyOk && profile.email_unsubscribed !== true, telegram: false };
  }

  const frequency = normalizeFrequency(profile);
  const unsubscribed = profile.email_unsubscribed === true;
  const planTelegram = canUseTelegram(profile);
  const linked = typeof profile.telegram_chat_id === "string" && profile.telegram_chat_id.length > 0;

  const wantsTelegram = ruleChannel === "telegram" || ruleChannel === "both";
  const telegram = wantsTelegram && planTelegram && linked;
  const email = ruleChannel === "email" || ruleChannel === "both" || (wantsTelegram && !telegram);

  if (mode === "daily") {
    return { email: email && !unsubscribed, telegram: telegram && frequency !== "realtime" };
  }
  if (frequency !== "realtime") return { email: false, telegram: false };
  return { email: email && !unsubscribed, telegram };
}

function alertInput(alert: AlertLike): AlertMatchInput {
  return {
    portfolio_id: alert.portfolio_id,
    title: alert.title,
    payload: alert.payload ?? null,
    portfolio: {
      id: alert.portfolio.id,
      slug: alert.portfolio.slug,
      name: alert.portfolio.name,
      source: alert.portfolio.source ?? null,
    },
  };
}

/**
 * Espejo del armado de buckets de la edge: una entrega por usuario y alerta,
 * uniendo los canales de follows y reglas (dedupe por alert_id).
 */
function planDeliveries(
  alerts: AlertLike[],
  follows: FollowLike[],
  rules: RuleLike[],
  mode: Mode,
): Delivery[] {
  const buckets = new Map<string, Map<string, { email: boolean; telegram: boolean }>>();

  const add = (userId: string, alertId: string, email: boolean, telegram: boolean) => {
    if (!email && !telegram) return;
    let bucket = buckets.get(userId);
    if (!bucket) {
      bucket = new Map();
      buckets.set(userId, bucket);
    }
    const existing = bucket.get(alertId);
    if (existing) {
      existing.email = existing.email || email;
      existing.telegram = existing.telegram || telegram;
      return;
    }
    bucket.set(alertId, { email, telegram });
  };

  for (const follow of follows) {
    const route = routeAlert({
      plan: follow.profile.plan,
      trialEndsAt: follow.profile.trial_ends_at,
      alertFrequency: follow.profile.alert_frequency,
      alertChannel: follow.profile.alert_channel,
      emailUnsubscribed: follow.profile.email_unsubscribed,
      telegramLinked: Boolean(follow.profile.telegram_chat_id),
      mode,
    });
    for (const alert of alerts) {
      if (alert.portfolio_id !== follow.portfolio_id) continue;
      add(follow.user_id, alert.id, route.email, route.telegram);
    }
  }

  for (const rule of rules) {
    const route = routeRule(rule.profile, rule.channel, mode);
    for (const alert of alerts) {
      if (ruleMatches(rule, alertInput(alert))) add(rule.user_id, alert.id, route.email, route.telegram);
    }
  }

  const out: Delivery[] = [];
  for (const [userId, bucket] of buckets) {
    for (const [alertId, channels] of bucket) {
      out.push({ userId, alertId, email: channels.email, telegram: channels.telegram });
    }
  }
  return out;
}

const nvdaAlert: AlertLike = {
  id: "a1",
  portfolio_id: "d1",
  title: "Nancy Pelosi compró $1M–$5M en NVDA",
  payload: { symbol: "nvda", value_usd: 1_000_000 },
  portfolio: {
    id: "d1",
    slug: "pelosi-tracker",
    name: "Pelosi Tracker",
    source: "house_disclosure",
  },
};

const freeDaily: ProfileRoute = { plan: "free", alert_frequency: "daily" };
const proRealtime: ProfileRoute = { plan: "pro", alert_frequency: "realtime" };

describe("routeRule — canal de la regla y frecuencia del perfil", () => {
  it("una regla de correo respeta la frecuencia: instant solo realtime", () => {
    expect(routeRule(freeDaily, "email", "instant")).toEqual({ email: false, telegram: false });
    expect(routeRule(proRealtime, "email", "instant")).toEqual({ email: true, telegram: false });
    expect(routeRule(freeDaily, "email", "daily")).toEqual({ email: true, telegram: false });
  });

  it("Telegram solo si el plan lo permite y hay chat vinculado", () => {
    // Pro realtime con chat vinculado: sale por Telegram.
    expect(
      routeRule({ ...proRealtime, telegram_chat_id: "42" }, "telegram", "instant"),
    ).toEqual({ email: false, telegram: true });
  });

  it("sin Telegram disponible la regla no se pierde: cae a correo", () => {
    expect(routeRule(proRealtime, "telegram", "instant")).toEqual({ email: true, telegram: false });
    expect(routeRule(freeDaily, "telegram", "daily")).toEqual({ email: true, telegram: false });
    expect(routeRule(freeDaily, "both", "daily")).toEqual({ email: true, telegram: false });
  });

  it("en el digest diario Telegram no repite a quien ya recibió realtime", () => {
    const realtime = { ...proRealtime, telegram_chat_id: "42" };
    expect(routeRule(realtime, "both", "daily")).toEqual({ email: true, telegram: false });
    const dailyTelegram = { plan: "pro", alert_frequency: "daily", telegram_chat_id: "42" };
    expect(routeRule(dailyTelegram, "telegram", "daily")).toEqual({ email: false, telegram: true });
  });

  it("la baja de correo bloquea la regla por correo pero no Telegram", () => {
    expect(routeRule({ ...proRealtime, email_unsubscribed: true }, "email", "instant")).toEqual({
      email: false,
      telegram: false,
    });
    expect(
      routeRule(
        { ...proRealtime, email_unsubscribed: true, telegram_chat_id: "42" },
        "telegram",
        "instant",
      ),
    ).toEqual({ email: false, telegram: true });
  });

  it("el semanal entra al correo con weekly_digest activo", () => {
    const weekly: ProfileRoute = { ...freeDaily, weekly_digest: true };
    expect(routeRule(weekly, "email", "weekly")).toEqual({ email: true, telegram: false });
    // weekly_digest undefined se trata como activo (default de la DB).
    expect(routeRule(freeDaily, "both", "weekly")).toEqual({ email: true, telegram: false });
  });

  it("sin weekly_digest la regla no entra al semanal", () => {
    expect(routeRule({ ...proRealtime, weekly_digest: false }, "email", "weekly")).toEqual({
      email: false,
      telegram: false,
    });
  });

  it("la baja de correo excluye la regla del semanal", () => {
    expect(
      routeRule({ ...proRealtime, weekly_digest: true, email_unsubscribed: true }, "email", "weekly"),
    ).toEqual({ email: false, telegram: false });
  });

  it("Telegram nunca va en el semanal, ni con chat vinculado", () => {
    const tg: ProfileRoute = {
      plan: "pro",
      alert_frequency: "realtime",
      telegram_chat_id: "42",
      weekly_digest: true,
    };
    expect(routeRule(tg, "telegram", "weekly")).toEqual({ email: true, telegram: false });
  });
});

describe("entrega de reglas a medida", () => {
  it("entrega por regla aunque el usuario no siga el portafolio", () => {
    const rule: RuleLike = {
      user_id: "u1",
      kind: "ticker",
      value: "NVDA",
      channel: "email",
      profile: freeDaily,
    };
    const daily = planDeliveries([nvdaAlert], [], [rule], "daily");
    expect(daily).toEqual([{ userId: "u1", alertId: "a1", email: true, telegram: false }]);

    // Gratis es daily: en la pasada instantánea no sale nada.
    expect(planDeliveries([nvdaAlert], [], [rule], "instant")).toEqual([]);
  });

  it("no entrega una regla inactiva ni una que no coincide", () => {
    const inactive: RuleLike = {
      user_id: "u1",
      kind: "ticker",
      value: "NVDA",
      channel: "email",
      active: false,
      profile: freeDaily,
    };
    const other: RuleLike = {
      user_id: "u2",
      kind: "ticker",
      value: "TSLA",
      channel: "email",
      profile: freeDaily,
    };
    expect(planDeliveries([nvdaAlert], [], [inactive, other], "daily")).toEqual([]);
  });

  it("en el semanal la regla suma al correo y deduplica con el follow", () => {
    const rule: RuleLike = {
      user_id: "u1",
      kind: "ticker",
      value: "NVDA",
      channel: "email",
      profile: { ...freeDaily, weekly_digest: true },
    };
    expect(planDeliveries([nvdaAlert], [], [rule], "weekly")).toEqual([
      { userId: "u1", alertId: "a1", email: true, telegram: false },
    ]);
    // El mismo usuario sigue el portafolio: una sola entrega semanal.
    const follow: FollowLike = { user_id: "u1", portfolio_id: "d1", profile: freeDaily };
    expect(planDeliveries([nvdaAlert], [follow], [rule], "weekly")).toHaveLength(1);
  });

  it("coincide por fuente y por monto igual que en el feed", () => {
    const source: RuleLike = {
      user_id: "u1",
      kind: "source",
      value: "house_disclosure",
      channel: "email",
      profile: freeDaily,
    };
    const amount: RuleLike = {
      user_id: "u2",
      kind: "min_amount",
      value: "1000000",
      channel: "email",
      profile: freeDaily,
    };
    const tiny: AlertLike = {
      id: "a2",
      portfolio_id: "d1",
      title: "Gottheimer compró $15K–$50K",
      payload: { symbol: "NVDA", value_usd: 50_000 },
      portfolio: { id: "d1", slug: "gottheimer-tracker", name: "Josh Gottheimer Tracker", source: "house_disclosure" },
    };
    const deliveries = planDeliveries([nvdaAlert, tiny], [], [source, amount], "daily");
    // u1 (fuente) recibe ambas; u2 (monto) solo la de US$1M.
    expect(deliveries.filter((d) => d.userId === "u1").map((d) => d.alertId).sort()).toEqual(["a1", "a2"]);
    expect(deliveries.filter((d) => d.userId === "u2").map((d) => d.alertId)).toEqual(["a1"]);
  });
});

describe("deduplicación contra follows (sin duplicados)", () => {
  it("seguir el portafolio y tener una regla que coincide da una sola entrega", () => {
    const follow: FollowLike = { user_id: "u1", portfolio_id: "d1", profile: proRealtime };
    const rule: RuleLike = {
      user_id: "u1",
      kind: "portfolio",
      value: "Pelosi",
      channel: "telegram",
      profile: { ...proRealtime, telegram_chat_id: "42" },
    };
    const deliveries = planDeliveries([nvdaAlert], [follow], [rule], "instant");
    expect(deliveries).toHaveLength(1);
    // El follow aporta correo y la regla Telegram: canales unidos, no dos filas.
    expect(deliveries[0]).toEqual({ userId: "u1", alertId: "a1", email: true, telegram: true });
  });

  it("dos reglas que coinciden cuentan como una sola entrega", () => {
    const a: RuleLike = { user_id: "u1", kind: "ticker", value: "NVDA", channel: "email", profile: proRealtime };
    const b: RuleLike = { user_id: "u1", kind: "portfolio", value: "Pelosi", channel: "email", profile: proRealtime };
    const deliveries = planDeliveries([nvdaAlert], [], [a, b], "instant");
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toEqual({ userId: "u1", alertId: "a1", email: true, telegram: false });
  });

  it("usuarios distintos reciben su propia entrega", () => {
    const follow: FollowLike = { user_id: "u1", portfolio_id: "d1", profile: proRealtime };
    const rule: RuleLike = { user_id: "u2", kind: "ticker", value: "NVDA", channel: "email", profile: freeDaily };
    const deliveries = planDeliveries([nvdaAlert], [follow], [rule], "daily");
    expect(deliveries.map((d) => d.userId).sort()).toEqual(["u1", "u2"]);
  });
});

// ---- Espejo de la paginaci�n y los lotes (X40B) ----

const RULE_PAGE_SIZE = 1000;
const RULE_MAX_PAGES = 50;
const PROFILE_BATCH_SIZE = 500;

interface RuleRowLike {
  id: number;
  user_id: string;
  kind: string;
  value: string;
  channel: string;
  active: boolean;
}

/** Espejo de `loadActiveRules` de la edge: p�ginas hasta una incompleta. */
async function loadActiveRules(
  fetchPage: (from: number, to: number) => Promise<RuleRowLike[]>,
  onCap?: (loaded: number) => void,
): Promise<RuleRowLike[]> {
  const rows: RuleRowLike[] = [];
  for (let page = 0; page < RULE_MAX_PAGES; page++) {
    const from = page * RULE_PAGE_SIZE;
    const batch = await fetchPage(from, from + RULE_PAGE_SIZE - 1);
    rows.push(...batch);
    if (batch.length < RULE_PAGE_SIZE) return rows;
    if (page === RULE_MAX_PAGES - 1) onCap?.(rows.length);
  }
  return rows;
}

/** Dataset fingido que aplica `.order("id")` + `.range(from, to)` como PostgREST. */
function makeRuleFetcher(dataset: RuleRowLike[]) {
  const sorted = [...dataset].sort((a, b) => a.id - b.id);
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    return sorted.slice(from, to + 1);
  };
  return { fetchPage, calls };
}

function ruleRow(id: number): RuleRowLike {
  return {
    id,
    user_id: `u${id % 7}`,
    kind: "ticker",
    value: "NVDA",
    channel: "email",
    active: true,
  };
}

/** Espejo de `loadRuleProfiles`: lotes de 500 ids. */
function loadProfileIds(userIds: string[]): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < userIds.length; i += PROFILE_BATCH_SIZE) {
    batches.push(userIds.slice(i, i + PROFILE_BATCH_SIZE));
  }
  return batches;
}

describe("paginaci�n de alert_rules y perfiles (X40B)", () => {
  it("lee 1000 + 3 reglas en dos p�ginas ordenadas por id", async () => {
    const dataset = Array.from({ length: 1003 }, (_, i) => ruleRow(i + 1));
    const { fetchPage, calls } = makeRuleFetcher(dataset);
    const rows = await loadActiveRules(fetchPage);
    expect(rows).toHaveLength(1003);
    expect(rows[0].id).toBe(1);
    expect(rows[1002].id).toBe(1003);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("una p�gina incompleta corta la lectura", async () => {
    const { fetchPage, calls } = makeRuleFetcher(
      Array.from({ length: 999 }, (_, i) => ruleRow(i + 1)),
    );
    expect(await loadActiveRules(fetchPage)).toHaveLength(999);
    expect(calls).toEqual([[0, 999]]);
  });

  it("el tope de 50 p�ginas avisa y no sigue paginando", async () => {
    let pages = 0;
    const caps: number[] = [];
    const rows = await loadActiveRules(
      async () => {
        pages++;
        return Array.from({ length: 1000 }, (_, i) => ruleRow(pages * 1000 + i));
      },
      (loaded) => caps.push(loaded),
    );
    expect(pages).toBe(50);
    expect(rows).toHaveLength(50_000);
    expect(caps).toEqual([50_000]);
  });

  it("los perfiles de las reglas se piden en lotes de 500 ids", () => {
    const ids = Array.from({ length: 1201 }, (_, i) => `u${i}`);
    const batches = loadProfileIds(ids);
    expect(batches.map((batch) => batch.length)).toEqual([500, 500, 201]);
    expect(batches.flat()).toEqual(ids);
  });
});
