import { createClient } from "@/lib/supabase/server";
import type {
  Portfolio,
  Holding,
  Alert,
  Profile,
  Follow,
  UserHolding,
} from "@/lib/types";
import { FREE_PLAN_FOLLOW_LIMIT } from "@/lib/types";

// ---- Portfolios ----
export async function getPortfolios(filters?: {
  category?: string;
  search?: string;
  country?: string;
}): Promise<Portfolio[]> {
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
  // Degrade gracefully: if Supabase isn't configured/reachable, return []
  // instead of crashing the page (lets the site render before backend setup).
  if (error) {
    console.warn("[reclu] getPortfolios error:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getPortfolioBySlug(slug: string): Promise<Portfolio | null> {
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

// ---- Holdings ----
export async function getHoldings(portfolioId: string): Promise<Holding[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holdings")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("weight", { ascending: false });
  if (error) {
    console.warn("[reclu] getHoldings error:", error.message);
    return [];
  }
  return data ?? [];
}

// ---- Alerts ----
export async function getAlerts(portfolioId?: string, limit = 20): Promise<Alert[]> {
  const supabase = await createClient();
  let query = supabase
    .from("alerts")
    .select(
      `
      *,
      portfolio:portfolios!inner ( id, slug, name )
    `,
    )
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (portfolioId) {
    query = query.eq("portfolio_id", portfolioId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[reclu] getAlerts error:", error.message);
    return [];
  }
  return data ?? [];
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
 * Follow a portfolio, enforcing the free-plan limit.
 * Returns { ok, error, reason? }.
 */
export async function followPortfolio(portfolioId: string): Promise<{
  ok: boolean;
  error?: string;
  reason?: "limit_reached" | "auth_required" | "premium_required";
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

  // Check portfolio premium status
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("premium")
    .eq("id", portfolioId)
    .single();
  if (portfolio?.premium && plan !== "pro") {
    return { ok: false, reason: "premium_required" };
  }

  if (plan === "free") {
    const { count } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count ?? 0) >= FREE_PLAN_FOLLOW_LIMIT) {
      return { ok: false, reason: "limit_reached" };
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
