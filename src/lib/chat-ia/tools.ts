/**
 * chat-ia/tools.ts — herramientas del chat IA (D52).
 *
 * Seguridad:
 * - Allowlist cerrada (TOOL_NAMES). Un nombre fuera de la lista se rechaza.
 * - Argumentos validados con zod estricto; nada del modelo llega crudo a SQL.
 * - Todas las lecturas usan el cliente de la SESIÓN (RLS del usuario y
 *   recorte por plan de las RPC get_portfolio_*). Nunca service role.
 * - La única herramienta "de escritura" (propose_holdings) NO escribe: devuelve
 *   una propuesta que la interfaz muestra para que el usuario confirme. El
 *   guardado real lo hace la server action saveHoldingsByMode tras el clic.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const PERIODS = ["1M", "3M", "YTD", "1A", "TOTAL"] as const;
export type Period = (typeof PERIODS)[number];

const symbol = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9.\-]{0,19}$/, "Símbolo inválido.");
const slug = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,79}$/, "Slug inválido.");

export const toolArgSchemas = {
  search_portfolios: z.strictObject({
    query: z.string().trim().min(1).max(60),
    limit: z.number().int().min(1).max(8).optional(),
  }),
  rank_portfolios: z.strictObject({
    period: z.enum(PERIODS),
    order: z.enum(["desc", "asc"]).optional(),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  get_portfolio: z.strictObject({ slug }),
  get_my_portfolio: z.strictObject({}),
  propose_holdings: z.strictObject({
    positions: z
      .array(
        z
          .strictObject({
            symbol,
            weight: z.number().finite().positive().max(100).optional(),
            quantity: z.number().finite().positive().max(1e12).optional(),
          })
          .refine((p) => p.weight !== undefined || p.quantity !== undefined, {
            message: "Cada posición necesita peso o cantidad.",
          }),
      )
      .min(1)
      .max(100),
  }),
} as const;

export type ToolName = keyof typeof toolArgSchemas;
export const TOOL_NAMES = Object.keys(toolArgSchemas) as ToolName[];

export function isAllowedTool(name: unknown): name is ToolName {
  return typeof name === "string" && (TOOL_NAMES as string[]).includes(name);
}

/** Definiciones para el modelo (formato OpenAI/OpenRouter). */
export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_portfolios",
      description: "Busca portafolios públicos de reclu por nombre (persona, fondo, ETF, AFP, corredora).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", maxLength: 60 },
          limit: { type: "integer", minimum: 1, maximum: 8 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rank_portfolios",
      description:
        "Ranking de portafolios por rendimiento real (portfolio_metrics). period: 1M, 3M, YTD, 1A (un año) o TOTAL.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          period: { type: "string", enum: [...PERIODS] },
          order: { type: "string", enum: ["desc", "asc"] },
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_portfolio",
      description: "Detalle de un portafolio por slug: métricas por periodo y principales posiciones.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { slug: { type: "string" } },
        required: ["slug"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_portfolio",
      description: "Posiciones del usuario actual en Mi portafolio (símbolo y peso).",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_holdings",
      description:
        "Propone agregar posiciones a Mi portafolio. NO guarda: muestra una tarjeta para que el usuario confirme con un clic.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          positions: {
            type: "array",
            maxItems: 100,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                symbol: { type: "string" },
                weight: { type: "number" },
                quantity: { type: "number" },
              },
              required: ["symbol"],
            },
          },
        },
        required: ["positions"],
      },
    },
  },
];

export interface PortfolioCardData {
  slug: string;
  name: string;
  category: string | null;
  image: string | null;
  period: Period | null;
  returnPct: number | null;
  benchmarkPct: number | null;
  asOf: string | null;
  spark: number[];
}

export interface HoldingsProposal {
  mode: "percentage" | "shares";
  rows: Array<{ symbol: string; value: number }>;
}

export interface ToolOutcome {
  /** Lo que ve el modelo (se envuelve como <untrusted>). */
  forModel: unknown;
  cards?: PortfolioCardData[];
  proposal?: HoldingsProposal;
}

type Db = SupabaseClient;

interface PortfolioRow {
  id: string;
  slug: string;
  name: string;
  category?: string | null;
  portrait_image?: string | null;
  cover_image?: string | null;
}

const PORTFOLIO_COLS = "id, slug, name, category, portrait_image, cover_image";

function imageOf(p: PortfolioRow): string | null {
  if (p.portrait_image && /^[\w.-]+$/.test(p.portrait_image)) return `/portraits/${p.portrait_image}`;
  if (p.cover_image && /^[\w.-]+$/.test(p.cover_image)) return `/covers/${p.cover_image}`;
  return null;
}

/** Escapa comodines de ILIKE. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()]/g, " ");
}

/** Reduce una serie a n puntos (mini-gráfico). */
export function downsample(values: number[], n = 32): number[] {
  if (values.length <= n) return values;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(values[Math.round((i * (values.length - 1)) / (n - 1))]);
  return out;
}

async function sparkFor(db: Db, portfolioId: string): Promise<number[]> {
  const { data, error } = await db.rpc("get_portfolio_performance", { p_portfolio: portfolioId });
  if (error || !Array.isArray(data)) return [];
  const rows = (data as Array<{ date?: string; value_pct?: number | string }>)
    .filter((r) => r.date && r.value_pct !== null && r.value_pct !== undefined)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-260)
    .map((r) => Number(r.value_pct))
    .filter(Number.isFinite);
  return downsample(rows);
}

async function metricsFor(db: Db, portfolioId: string) {
  const { data, error } = await db.rpc("get_portfolio_metrics", { p_portfolio: portfolioId });
  if (error || !Array.isArray(data)) return [] as Array<Record<string, unknown>>;
  return data as Array<Record<string, unknown>>;
}

function pickMetric(metrics: Array<Record<string, unknown>>, period: Period) {
  return metrics
    .filter((m) => m.period === period && m.return_pct !== null)
    .sort((a, b) => String(b.as_of).localeCompare(String(a.as_of)))[0];
}

async function cardFor(db: Db, p: PortfolioRow, period: Period = "1A"): Promise<PortfolioCardData> {
  const [metrics, spark] = await Promise.all([metricsFor(db, p.id), sparkFor(db, p.id)]);
  const m = pickMetric(metrics, period) ?? pickMetric(metrics, "TOTAL");
  return {
    slug: p.slug,
    name: p.name,
    category: p.category ?? null,
    image: imageOf(p),
    period: m ? (m.period as Period) : null,
    returnPct: m?.return_pct != null ? Number(m.return_pct) : null,
    benchmarkPct: m?.benchmark_return_pct != null ? Number(m.benchmark_return_pct) : null,
    asOf: m?.as_of ? String(m.as_of) : null,
    spark,
  };
}

/** Convierte la propuesta del modelo al formato de saveHoldingsByMode. */
export function toProposal(positions: Array<{ symbol: string; weight?: number; quantity?: number }>): HoldingsProposal {
  const merged = new Map<string, { weight?: number; quantity?: number }>();
  for (const p of positions) {
    const prev = merged.get(p.symbol) ?? {};
    merged.set(p.symbol, {
      weight: p.weight !== undefined ? (prev.weight ?? 0) + p.weight : prev.weight,
      quantity: p.quantity !== undefined ? (prev.quantity ?? 0) + p.quantity : prev.quantity,
    });
  }
  const list = [...merged.entries()];
  if (list.every(([, v]) => v.quantity !== undefined)) {
    return { mode: "shares", rows: list.map(([s, v]) => ({ symbol: s, value: v.quantity as number })) };
  }
  const total = list.reduce((sum, [, v]) => sum + (v.weight ?? 0), 0);
  const rows = list
    .filter(([, v]) => (v.weight ?? 0) > 0)
    .map(([s, v]) => ({ symbol: s, value: Number((((v.weight ?? 0) / (total || 1)) * 100).toFixed(4)) }));
  return { mode: "percentage", rows };
}

export async function executeTool(
  db: Db,
  userId: string,
  name: string,
  rawArgs: unknown,
): Promise<ToolOutcome> {
  if (!isAllowedTool(name)) return { forModel: { error: "Herramienta no permitida." } };
  const parsed = toolArgSchemas[name].safeParse(rawArgs ?? {});
  if (!parsed.success) return { forModel: { error: "Argumentos inválidos." } };

  switch (name) {
    case "search_portfolios": {
      const args = parsed.data as z.infer<typeof toolArgSchemas.search_portfolios>;
      const { data, error } = await db
        .from("portfolios")
        .select(PORTFOLIO_COLS)
        .eq("is_active", true)
        .ilike("name", `%${escapeLike(args.query)}%`)
        .limit(args.limit ?? 5);
      if (error) return { forModel: { error: "No se pudo buscar." } };
      const rows = (data ?? []) as PortfolioRow[];
      const cards = await Promise.all(rows.map((p) => cardFor(db, p)));
      return { forModel: { results: cards.map(({ spark: _s, image: _i, ...c }) => c) }, cards };
    }
    case "rank_portfolios": {
      const args = parsed.data as z.infer<typeof toolArgSchemas.rank_portfolios>;
      const limit = args.limit ?? 5;
      const { data, error } = await db
        .from("portfolio_metrics")
        .select(`portfolio_id, period, as_of, return_pct, benchmark_return_pct, portfolios!inner(${PORTFOLIO_COLS}, is_active)`)
        .eq("period", args.period)
        .not("return_pct", "is", null)
        .eq("portfolios.is_active", true)
        .order("return_pct", { ascending: args.order === "asc" })
        .limit(200);
      if (error) return { forModel: { error: "No se pudo calcular el ranking." } };
      const seen = new Set<string>();
      const top: Array<{ p: PortfolioRow; m: Record<string, unknown> }> = [];
      for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        const p = (Array.isArray(row.portfolios) ? row.portfolios[0] : row.portfolios) as PortfolioRow | undefined;
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        top.push({ p, m: row });
        if (top.length >= limit) break;
      }
      const cards = await Promise.all(
        top.map(async ({ p, m }) => ({
          slug: p.slug,
          name: p.name,
          category: p.category ?? null,
          image: imageOf(p),
          period: args.period,
          returnPct: Number(m.return_pct),
          benchmarkPct: m.benchmark_return_pct != null ? Number(m.benchmark_return_pct) : null,
          asOf: m.as_of ? String(m.as_of) : null,
          spark: await sparkFor(db, p.id),
        })),
      );
      return {
        forModel: {
          period: args.period,
          note: "Solo portafolios visibles para el plan del usuario. Rendimientos pasados.",
          ranking: cards.map(({ spark: _s, image: _i, ...c }, i) => ({ rank: i + 1, ...c })),
        },
        cards,
      };
    }
    case "get_portfolio": {
      const args = parsed.data as z.infer<typeof toolArgSchemas.get_portfolio>;
      const { data, error } = await db
        .from("portfolios")
        .select(PORTFOLIO_COLS)
        .eq("slug", args.slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error || !data) return { forModel: { error: "Portafolio no encontrado." } };
      const p = data as PortfolioRow;
      const [card, metrics, holdings] = await Promise.all([
        cardFor(db, p),
        metricsFor(db, p.id),
        db.from("holdings").select("symbol, name, weight").eq("portfolio_id", p.id).order("weight", { ascending: false }).limit(10),
      ]);
      return {
        forModel: {
          slug: p.slug,
          name: p.name,
          metrics: metrics.map((m) => ({
            period: m.period,
            as_of: m.as_of,
            return_pct: m.return_pct,
            benchmark: m.benchmark_symbol,
            benchmark_return_pct: m.benchmark_return_pct,
            sharpe: m.sharpe,
            max_drawdown: m.max_drawdown,
          })),
          top_holdings: holdings.error ? [] : holdings.data,
        },
        cards: [card],
      };
    }
    case "get_my_portfolio": {
      // RLS "own holdings all": solo filas de auth.uid(). El eq es una segunda barrera.
      const { data, error } = await db
        .from("user_holdings")
        .select("symbol, weight")
        .eq("user_id", userId)
        .order("weight", { ascending: false })
        .limit(100);
      if (error) return { forModel: { error: "No se pudo leer tu portafolio." } };
      return { forModel: { positions: data ?? [] } };
    }
    case "propose_holdings": {
      const args = parsed.data as z.infer<typeof toolArgSchemas.propose_holdings>;
      const proposal = toProposal(args.positions);
      return {
        forModel: { status: "pending_user_confirmation", positions: proposal.rows.length },
        proposal,
      };
    }
  }
}
