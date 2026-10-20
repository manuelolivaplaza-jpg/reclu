import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Portfolio,
  Holding,
  Alert,
  Profile,
  Follow,
  UserHolding,
} from "@/lib/types";
import { FREE_PLAN_FOLLOW_LIMIT, PRO_PLAN_FOLLOW_LIMIT } from "@/lib/types";
import { DEMO_PORTFOLIOS, demoPortfolioBySlug, demoHoldings, demoAlerts, HIDDEN_DEMO_SLUGS, demoRedirectTarget, isHiddenSlug } from "@/lib/demo-data";
import {
  HOLDING_LIMITS,
  ALERT_LIMITS,
  type AccessRole,
} from "@/lib/access";
import { isPublicDisclosureSource } from "@/lib/public-disclosure";
import {
  FREE_BACKTEST_WINDOW_DAYS,
  trimSeriesToWindow,
} from "@/lib/backtest-window";

/** True cuando Supabase está configurado con valores reales (no placeholder). */
function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

// ---- Portfolios ----
export async function getPortfolios(filters?: {
  category?: string;
  search?: string;
  country?: string;
}): Promise<Portfolio[]> {
  // Sin backend real -> datos de demostración (el sitio se ve vivo).
  if (!isSupabaseLive()) {
    let list = DEMO_PORTFOLIOS.filter((p) => !isHiddenSlug(p.slug));
    if (filters?.category && filters.category !== "all") list = list.filter((p) => p.category === filters.category);
    if (filters?.country && filters.country !== "all") list = list.filter((p) => p.country === filters.country);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || (p.manager ?? "").toLowerCase().includes(q));
    }
    return list;
  }

  const supabase = await createClient();
  let query = supabase
    .from("portfolios")
    .select("*")
    .eq("is_active", true)
    .order("followers", { ascending: false });

  if (filters?.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }
  if (filters?.country && filters.country !== "all") {
    query = query.eq("country", filters.country);
  }
  if (filters?.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,manager.ilike.%${filters.search}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[reclu] getPortfolios error:", error.message);
    return [];
  }
  // DB real pero vacía (seed no corrido) -> caemos a demo para no ver el sitio vacío.
  if (!data || data.length === 0) return DEMO_PORTFOLIOS.filter((p) => !isHiddenSlug(p.slug));
  return data;
}

/**
 * Slug real al que redirige un portafolio oculto (cifras inventadas), o `null`
 * si no aplica. Solo redirige si el portafolio real está activo/disponible.
 *
 * Lectura con el cliente anónimo: la política RLS `portfolios public read`
 * limita el select a `is_active = true`, así que normalmente la fila inactiva
 * no se puede leer y caemos al mapa estático de `demo-data` (no usamos el
 * cliente admin aquí). Si la RLS sí deja leer la fila, preferimos su
 * `replaced_by_slug`.
 */
export async function getPortfolioRedirect(slug: string): Promise<string | null> {
  if (!isHiddenSlug(slug)) return null;

  const fallback = HIDDEN_DEMO_SLUGS[slug] ?? null;
  if (!isSupabaseLive()) return demoRedirectTarget(slug);

  const supabase = await createClient();

  let target: string | null = fallback;
  const { data: hiddenRow } = await supabase
    .from("portfolios")
    .select("slug, replaced_by_slug, is_active")
    .eq("slug", slug)
    .maybeSingle();
  if (hiddenRow?.replaced_by_slug) target = hiddenRow.replaced_by_slug;
  if (!target) return null;

  // El destino solo vale si está activo (el cliente anónimo sí puede leerlo).
  const { data: realRow } = await supabase
    .from("portfolios")
    .select("slug, is_active")
    .eq("slug", target)
    .eq("is_active", true)
    .maybeSingle();
  return realRow ? target : null;
}

export async function getPortfolioBySlug(slug: string): Promise<Portfolio | null> {
  if (!isSupabaseLive()) return demoPortfolioBySlug(slug);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (error) return null;
  return data;
}

function performanceValue(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

/**
 * Serie real de rendimiento. value = value_pct.
 * Sin tabla, sin filas o ante cualquier fallo: [] (no se inventa una curva).
 *
 * Muro 048: se pide por `get_portfolio_performance`, que recorta según el
 * plan de auth.uid() (premium oculto a no pagos, 90 días para anon/free).
 * Además se recorta otra vez en el servidor por si la RPC devolviera más
 * historial del que corresponde (defensa en profundidad).
 */
export async function getPerformance(
  portfolioId: string,
  limit = 365,
  opts?: { role?: AccessRole; source?: string | null },
): Promise<{ date: string; value: number }[]> {
  if (!isSupabaseLive()) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_portfolio_performance", {
      p_portfolio: portfolioId,
    });

    if (error || !Array.isArray(data)) {
      if (error) console.warn("[reclu] getPerformance error:", error.message);
      return [];
    }

    const points: { date: string; value: number }[] = [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const record = row as { date?: unknown; value_pct?: unknown };
      const value = performanceValue(record.value_pct);
      if (typeof record.date !== "string" || record.date.length === 0 || value === null) continue;
      points.push({ date: record.date, value });
    }

    const trimmed =
      opts?.role && opts.role !== "paid"
        ? trimSeriesToWindow(points, FREE_BACKTEST_WINDOW_DAYS, opts?.source)
        : points;
    return trimmed.slice(-limit);
  } catch (err) {
    console.warn(
      "[reclu] getPerformance error:",
      err instanceof Error ? err.message : "unknown",
    );
    return [];
  }
}

// ---- Holdings ----
/**
 * Holdings ordenados por peso descendente.
 *
 * Muro de pago (migración 012): usa la función security definer
 * `get_portfolio_holdings` que recorta según el plan de auth.uid().
 * Si la función aún no existe (migración sin aplicar), cae a la lectura
 * anon directa y recorta en el servidor — la página nunca envía al
 * navegador más de lo que el plan permite.
 */
export async function getHoldings(
  portfolioId: string,
  opts?: { role?: AccessRole },
): Promise<Holding[]> {
  // En modo demo, portfolioId es el slug (d1, d7...). Resolvemos por slug.
  if (!isSupabaseLive()) {
    const slug = DEMO_PORTFOLIOS.find((p) => p.id === portfolioId)?.slug ?? portfolioId;
    const list = demoHoldings(slug);
    if (slug === "trump-compra") return list;
    return sliceHoldings(list, opts?.role);
  }

  const supabase = await createClient();

  // Camino con migración 012 aplicada: RPC con recorte en la base.
  const slugRow = await supabase
    .from("portfolios")
    .select("slug, source")
    .eq("id", portfolioId)
    .maybeSingle();
  if (slugRow.data?.slug) {
    const { data: rpc, error: rpcError } = await supabase
      .rpc("get_portfolio_holdings", { p_slug: slugRow.data.slug });
    if (!rpcError && Array.isArray(rpc)) {
      return rpc as Holding[];
    }
    // Si la función no existe, seguimos por el camino legacy de abajo.
  }

  // Fallback (migración no aplicada): lectura directa + recorte servidor.
  const { data, error } = await supabase
    .from("holdings")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("weight", { ascending: false });
  if (error) {
    console.warn("[reclu] getHoldings error:", error.message);
    return [];
  }
  if (!data || data.length === 0) {
    // Buscar el slug real para servir demo si la DB está vacía.
    const { data: pf } = await supabase.from("portfolios").select("slug").eq("id", portfolioId).maybeSingle();
    return pf ? sliceHoldings(demoHoldings(pf.slug), opts?.role) : [];
  }
  if (isPublicDisclosureSource(slugRow.data?.source)) return data as Holding[];
  return sliceHoldings(data, opts?.role);
}

/** Recorte en servidor según rol (muro de pago real). */
function sliceHoldings(list: Holding[], role: AccessRole | undefined): Holding[] {
  if (!role) return list;
  const limit = HOLDING_LIMITS[role];
  return Number.isFinite(limit) ? list.slice(0, limit) : list;
}

/**
 * Holdings COMPLETOS con cliente de servicio — solo agregados del servidor
 * (radar de consenso, filtros por símbolo, comparador). El resultado se
 * agrega antes de llegar al navegador; nunca se expone crudo.
 * Requiere migración 012 aplicada si el catálogo vive tras el muro.
 */
export async function getAllHoldingsAdmin(portfolioId: string): Promise<Holding[]> {
  const admin = createAdminClient();
  if (!admin) return getHoldings(portfolioId);
  const { data, error } = await admin
    .from("holdings")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("weight", { ascending: false });
  if (error) {
    console.warn("[reclu] getAllHoldingsAdmin error:", error.message);
    return [];
  }
  return (data ?? []) as Holding[];
}

// ---- Alerts ----
/**
 * Alertas publicadas. Muro de pago: usa la función security definer
 * `get_alerts`, que recorta según el plan de auth.uid() (topes 3/10/p_limit)
 * y devuelve `summary` solo a pro/elite. El rol de la app se aplica otra vez
 * en el servidor (defensa en profundidad).
 *
 * `portfolioIds` permite juntar las alertas de varios portafolios (dashboard)
 * sin leer la tabla directo. La lectura directa de `alerts` ya no sirve para
 * anon/authenticated: la 048 revocó el privilegio sobre `summary` y un
 * `select("*")` falla.
 */
export async function getAlerts(
  portfolioId?: string,
  limit = 20,
  opts?: { role?: AccessRole; portfolioIds?: string[] },
): Promise<Alert[]> {
  const ids = opts?.portfolioIds?.length
    ? opts.portfolioIds
    : [portfolioId];

  if (!isSupabaseLive()) {
    const demo = portfolioId
      ? demoAlerts(portfolioId)
      : opts?.portfolioIds?.length
        ? demoAlerts().filter((alert) => ids.includes(alert.portfolio_id))
        : demoAlerts();
    return applyAlertAccess(demo, opts?.role).slice(0, limit);
  }

  try {
    const supabase = await createClient();
    const responses = await Promise.all(
      ids.map((id) =>
        supabase.rpc("get_alerts", {
          p_portfolio: id ?? null,
          p_limit: Math.min(Math.max(limit, 1), 100),
        }),
      ),
    );

    const merged: Alert[] = [];
    for (const { data, error } of responses) {
      if (error) {
        console.warn("[reclu] getAlerts error:", error.message);
        continue;
      }
      if (Array.isArray(data)) merged.push(...(data as Alert[]));
    }

    const byId = new Map<string, Alert>();
    for (const alert of merged) {
      if (alert?.id) byId.set(alert.id, alert);
    }
    const sorted = [...byId.values()].sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
    );
    return applyAlertAccess(sorted, opts?.role).slice(0, limit);
  } catch (err) {
    console.warn(
      "[reclu] getAlerts error:",
      err instanceof Error ? err.message : "unknown",
    );
    return [];
  }
}

/**
 * Recorte de alertas según rol (muro de pago real). Para anon/free el
 * resumen AI se elimina aunque la RPC lo devolviera.
 */
function applyAlertAccess(list: Alert[], role: AccessRole | undefined): Alert[] {
  const limit = role ? ALERT_LIMITS[role] : Infinity;
  const capped = Number.isFinite(limit) ? list.slice(0, limit) : list;
  if (!role || role === "paid") return capped;
  return capped.map((alert) => ({ ...alert, summary: null }));
}

// ---- Profile ----
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) return null;
  return data;
}

// ---- Follows ----
export async function getFollows(): Promise<Follow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("follows")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[reclu] getFollows error:", error.message);
    return [];
  }
  return data ?? [];
}

export async function isFollowing(portfolioId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("follows")
    .select("portfolio_id")
    .eq("user_id", user.id)
    .eq("portfolio_id", portfolioId)
    .maybeSingle();
  return !!data;
}

/**
 * Follow a portfolio, enforcing plan limits (free 2 / pro 15 / elite unlimited).
 * Returns { ok, error, reason?, limit? }.
 */
export async function followPortfolio(portfolioId: string): Promise<{
  ok: boolean;
  error?: string;
  reason?: "limit_reached" | "auth_required" | "premium_required";
  /** Plan limit hit, for a tailored message. */
  limit?: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "auth_required" };

  // Check plan + limits
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  const plan = profile?.plan ?? "free";

  // Check portfolio premium status (any paid plan unlocks it)
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("premium")
    .eq("id", portfolioId)
    .single();
  if (portfolio?.premium && (plan === "free")) {
    return { ok: false, reason: "premium_required" };
  }

  if (plan !== "elite") {
    // Límite desde la fuente única src/lib/plans.ts (free 2 / pro 15).
    // Nota: isTrialPro no aplica al límite de follows (la prueba es de Pro
    // para alertas/IA; el límite de seguidos sigue siendo el del plan real).
    const limit = plan === "pro" ? PRO_PLAN_FOLLOW_LIMIT : FREE_PLAN_FOLLOW_LIMIT;
    const { count } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count ?? 0) >= limit) {
      return { ok: false, reason: "limit_reached", limit };
    }
  }

  const { error } = await supabase
    .from("follows")
    .insert({ user_id: user.id, portfolio_id: portfolioId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unfollowPortfolio(portfolioId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("user_id", user.id)
    .eq("portfolio_id", portfolioId);
  return { ok: !error };
}

// ---- User's own holdings (comparison) ----
export async function getUserHoldings(): Promise<UserHolding[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("user_holdings")
    .select("*")
    .eq("user_id", user.id)
    .order("weight", { ascending: false });
  if (error) {
    console.warn("[reclu] getUserHoldings error:", error.message);
    return [];
  }
  return data ?? [];
}
