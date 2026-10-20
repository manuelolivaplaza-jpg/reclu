import type { SupabaseClient } from "@supabase/supabase-js";
import {
  API_KEY_PREFIX,
  apiDayKey,
  apiPublicEnabled,
  authenticateApiKey,
  extractBearerToken,
  isApiKeyFormat,
  normalizeApiPlan,
  rateLimit,
  rateLimitHeaders,
  type ApiPlan,
} from "@/lib/api-keys";
import {
  getApiDataset,
  paginationMeta,
  parsePagination,
  type ApiDatasetSlug,
  type ApiListResponse,
} from "@/lib/api-datasets";
import { getServiceClient } from "@/lib/supabase/service";
import { isPaidPlan } from "@/lib/types";

/**
 * GET /api/v1/{afp|corredoras|infoprobidad|dividendos|hechos|insiders}
 *
 * Lista blanca cerrada (F54). Los datasets de declaraciones de funcionarios
 * de EE.UU. quedan fuera por 5 U.S.C. § 13107 y responden 404 antes de mirar
 * la clave. Todo el resto exige `API_PUBLIC_ENABLED=true`, una clave válida y
 * cuota diaria según el plan **actual** del dueño (`profiles.plan`), no el
 * plan con que se emitió la clave.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Respuesta de error uniforme (nunca detalla si una clave existe o no). */
function errorResponse(
  status: number,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: message, status },
    { status, headers: { ...NO_STORE, ...headers } },
  );
}

/** Cabecera genérica: revocada, inexistente y mal formada se ven igual. */
const INVALID_KEY = "Clave de API inválida.";

interface ApiKeyRow {
  id: string;
  user_id: string;
  prefix: string;
  key_hash: string;
  revoked: boolean;
}

interface DataPage {
  rows: Record<string, unknown>[];
  total: number;
}

/** Error de lectura de datos, para no filtrar detalles de PostgREST. */
class DataQueryError extends Error {}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function embeddedOne(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function isIsoDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function totalOf(count: number | null, rows: Record<string, unknown>[]): number {
  return typeof count === "number" ? count : rows.length;
}

// ---- Datasets respaldados por holdings + portafolios ----

const HOLDING_COLUMNS =
  "symbol,name,weight,previous_weight,asset_class,exchange,currency,as_of,portfolio:portfolios!inner(slug,name,manager,source,premium,category,country)";

const AFP_SLUG = "afp-modelo-acciones-cl";

const CORREDORAS_SLUGS = [
  "bice-acciones-destacadas",
  "mbi-acciones-recomendadas",
  "consenso-corredoras-cl",
] as const;

function mapHolding(row: Record<string, unknown>) {
  const portfolio = embeddedOne(row.portfolio);
  return {
    symbol: row.symbol,
    name: row.name,
    weight: row.weight,
    previous_weight: row.previous_weight,
    asset_class: row.asset_class,
    exchange: row.exchange,
    currency: row.currency,
    as_of: row.as_of,
    portfolio: portfolio
      ? {
          slug: portfolio.slug,
          name: portfolio.name,
          manager: portfolio.manager,
          source: portfolio.source,
          country: portfolio.country,
        }
      : null,
  };
}

async function loadHoldings(
  client: SupabaseClient,
  slugs: readonly string[],
  params: URLSearchParams,
  plan: ApiPlan,
): Promise<DataPage> {
  const pagination = parsePagination(params);
  const symbol = params.get("symbol")?.trim().toUpperCase();
  const portfolioFilter = params.get("portfolio")?.trim();

  let query = client
    .from("holdings")
    .select(HOLDING_COLUMNS, { count: "exact" })
    .in("portfolio.slug", [...slugs])
    .order("as_of", { ascending: false })
    .order("weight", { ascending: false })
    .range(pagination.from, pagination.to);

  if (symbol) query = query.eq("symbol", symbol);

  // Muro 048: un plan Gratis no ve carteras premium. Hoy estas seis fuentes
  // son públicas, pero el filtro queda para no abrir un bypass si una pasa a
  // premium más adelante.
  if (!isPaidPlan(plan)) query = query.eq("portfolio.premium", false);

  if (portfolioFilter) query = query.eq("portfolio.slug", portfolioFilter);

  const { data, count, error } = await query;
  if (error) throw new DataQueryError(error.message);

  const rows = ((data ?? []) as unknown[])
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => !!row)
    .map(mapHolding);

  return { rows, total: totalOf(count, rows) };
}

// ---- Datasets de tabla simple ----

interface TableQueryOptions {
  params: URLSearchParams;
  columns: string;
  order: { column: string; ascending: boolean }[];
}

type TableFilter = (query: unknown) => unknown;

async function loadTable(
  client: SupabaseClient,
  table: string,
  options: TableQueryOptions,
  decorate?: TableFilter,
): Promise<DataPage> {
  const pagination = parsePagination(options.params);
  let query = client
    .from(table)
    .select(options.columns, { count: "exact" });

  for (const order of options.order) {
    query = query.order(order.column, { ascending: order.ascending });
  }

  if (decorate) {
    // `decorate` devuelve el query ya filtrado. El cast queda contenido aquí
    // porque el builder de Supabase no expone un tipo común para todos los
    // filtros encadenados.
    query = decorate(query) as typeof query;
  }

  const { data, count, error } = await query.range(
    pagination.from,
    pagination.to,
  );
  if (error) throw new DataQueryError(error.message);

  const rows = ((data ?? []) as unknown[])
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => !!row);
  return { rows, total: totalOf(count, rows) };
}

async function loadDataset(
  slug: ApiDatasetSlug,
  client: SupabaseClient,
  params: URLSearchParams,
  plan: ApiPlan,
): Promise<DataPage> {
  switch (slug) {
    case "afp":
      return loadHoldings(client, [AFP_SLUG], params, plan);

    case "corredoras":
      return loadHoldings(client, CORREDORAS_SLUGS, params, plan);

    case "infoprobidad": {
      const symbol = params.get("symbol")?.trim().toUpperCase();
      return loadTable(
        client,
        "infoprobidad_empresas",
        {
          params,
          columns:
            "rut,nombre,symbol,autoridades,valor_declarado_clp,ultima_declaracion,updated_at",
          order: [
            { column: "autoridades", ascending: false },
            { column: "nombre", ascending: true },
          ],
        },
        symbol
          ? (query) =>
              (query as unknown as { eq: (c: string, v: string) => unknown }).eq(
                "symbol",
                symbol,
              )
          : undefined,
      );
    }

    case "dividendos": {
      const nemo = params.get("nemo")?.trim().toUpperCase();
      const desde = params.get("desde");
      const hasta = params.get("hasta");
      return loadTable(
        client,
        "cl_dividends",
        {
          params,
          columns:
            "id,nemo,razon_social,fecha_pago,fecha_limite,fecha_acuerdo,fecha_cierre,numero_dividendo,serie,tipo,moneda,monto,fuente,source_url",
          order: [
            { column: "fecha_pago", ascending: false },
            { column: "nemo", ascending: true },
          ],
        },
        (query) => {
          type Filter = { eq: (c: string, v: string) => unknown; gte: (c: string, v: string) => unknown; lte: (c: string, v: string) => unknown };
          let filtered = query as unknown as Filter;
          if (nemo) filtered = filtered.eq("nemo", nemo) as Filter;
          if (isIsoDate(desde)) filtered = filtered.gte("fecha_pago", desde) as Filter;
          if (isIsoDate(hasta)) filtered = filtered.lte("fecha_pago", hasta) as Filter;
          return filtered;
        },
      );
    }

    case "hechos": {
      const emisor = params.get("emisor")?.trim().slice(0, 80);
      const categoria = params.get("categoria");
      const desde = params.get("desde");
      const hasta = params.get("hasta");
      return loadTable(
        client,
        "cl_material_events",
        {
          params,
          columns:
            "id,fecha,numero_documento,emisor,materia,categoria,titulo,url",
          order: [{ column: "fecha", ascending: false }],
        },
        (query) => {
          type Filter = {
            eq: (c: string, v: string) => unknown;
            ilike: (c: string, v: string) => unknown;
            gte: (c: string, v: string) => unknown;
            lte: (c: string, v: string) => unknown;
          };
          let filtered = query as unknown as Filter;
          if (emisor) filtered = filtered.ilike("emisor", `%${emisor}%`) as Filter;
          if (categoria) filtered = filtered.eq("categoria", categoria) as Filter;
          if (isIsoDate(desde)) filtered = filtered.gte("fecha", desde) as Filter;
          if (isIsoDate(hasta)) filtered = filtered.lte("fecha", hasta) as Filter;
          return filtered;
        },
      );
    }

    case "insiders": {
      const symbol = params.get("symbol")?.trim().toUpperCase();
      const code = params.get("code")?.trim().toUpperCase();
      const desde = params.get("desde");
      const hasta = params.get("hasta");
      return loadTable(
        client,
        "insider_trades",
        {
          params,
          columns:
            "id,accession,symbol,owner_name,owner_title,is_director,is_officer,trans_date,filed_at,code,shares,price,value_usd,shares_after,source_url",
          order: [
            { column: "filed_at", ascending: false },
            { column: "trans_date", ascending: false },
          ],
        },
        (query) => {
          type Filter = {
            eq: (c: string, v: string) => unknown;
            gte: (c: string, v: string) => unknown;
            lte: (c: string, v: string) => unknown;
          };
          let filtered = query as unknown as Filter;
          if (symbol) filtered = filtered.eq("symbol", symbol) as Filter;
          if (code === "P" || code === "S") {
            filtered = filtered.eq("code", code) as Filter;
          }
          if (isIsoDate(desde)) filtered = filtered.gte("filed_at", desde) as Filter;
          if (isIsoDate(hasta)) filtered = filtered.lte("filed_at", hasta) as Filter;
          return filtered;
        },
      );
    }

    default:
      throw new DataQueryError("Dataset sin implementación.");
  }
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ dataset: string }> },
): Promise<Response> {
  const { dataset: slug } = await ctx.params;
  const dataset = getApiDataset(slug);

  // Lista blanca primero: los datasets excluidos (y cualquier inventado)
  // responden 404 sin revelar si existen en la base.
  if (!dataset) {
    return errorResponse(404, "Dataset no encontrado.");
  }

  if (!apiPublicEnabled()) {
    return errorResponse(503, "La API pública no está habilitada.");
  }

  const client = getServiceClient();
  if (!client) {
    return errorResponse(
      503,
      "La API todavía no está configurada. Inténtalo más tarde.",
    );
  }

  const authorization = request.headers.get("authorization");
  const token = extractBearerToken(authorization);
  if (!isApiKeyFormat(token)) {
    return errorResponse(401, INVALID_KEY);
  }

  const prefix = token.slice(0, API_KEY_PREFIX.length + 12);
  const { data: keyData, error: keyError } = await client
    .from("api_keys")
    .select("id,user_id,prefix,key_hash,revoked")
    .eq("prefix", prefix)
    .maybeSingle();
  const keyRow = keyData as ApiKeyRow | null;

  if (keyError) {
    console.warn("[reclu] api key lookup:", keyError.message);
    return errorResponse(503, "No pudimos validar la clave. Inténtalo más tarde.");
  }

  const auth = authenticateApiKey(authorization, keyRow, true);
  if (!auth.ok || !keyRow) {
    // Revocada, inexistente y mal formada comparten esta respuesta.
    return errorResponse(401, INVALID_KEY);
  }

  // Plan vigente del dueño, leído en cada request con service role. Si baja
  // de plan, su clave deja de tener el límite anterior de inmediato.
  const { data: profileData, error: profileError } = await client
    .from("profiles")
    .select("plan")
    .eq("id", keyRow.user_id)
    .maybeSingle();
  if (profileError) {
    console.warn("[reclu] api profile lookup:", profileError.message);
  }
  const profile = profileData as { plan: string | null } | null;
  const plan = normalizeApiPlan(profile?.plan);

  const today = apiDayKey();
  const { data: usageData, error: usageError } = await client
    .from("api_usage")
    .select("count,day")
    .eq("key_id", keyRow.id)
    .eq("day", today)
    .maybeSingle();
  if (usageError) {
    console.warn("[reclu] api usage lookup:", usageError.message);
    return errorResponse(503, "No pudimos revisar tu cuota. Inténtalo más tarde.");
  }
  const usage = usageData as { count: number; day: string } | null;

  const decision = rateLimit({
    plan,
    used: usage?.count ?? 0,
    day: usage?.day ?? null,
    today,
  });
  if (!decision.allowed) {
    return errorResponse(429, "Límite diario alcanzado.", rateLimitHeaders(decision));
  }

  const { data: consumed, error: consumeError } = await client.rpc(
    "consume_api_usage",
    { p_key_id: keyRow.id, p_day: today },
  );
  if (consumeError) {
    console.warn("[reclu] api usage consume:", consumeError.message);
    return errorResponse(503, "No pudimos registrar tu llamada. Inténtalo más tarde.");
  }

  const usedAfter =
    typeof consumed === "number" ? consumed : decision.used + 1;
  const after = rateLimit({ plan, used: usedAfter, day: today, today });

  // Best effort: la UI de Ajustes muestra la última llamada. Un fallo aquí no
  // invalida la respuesta de datos.
  await client
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  let page: DataPage;
  try {
    page = await loadDataset(
      dataset.slug as ApiDatasetSlug,
      client,
      new URL(request.url).searchParams,
      plan,
    );
  } catch (error) {
    console.warn(
      "[reclu] api dataset:",
      error instanceof Error ? error.message : "error desconocido",
    );
    return errorResponse(503, "No pudimos leer los datos. Inténtalo más tarde.");
  }

  const body: ApiListResponse<Record<string, unknown>> = {
    dataset: dataset.slug,
    license: dataset.license,
    license_url: dataset.licenseUrl,
    attribution: dataset.attribution,
    source_url: dataset.sourceUrl,
    generated_at: new Date().toISOString(),
    pagination: paginationMeta(
      parsePagination(new URL(request.url).searchParams),
      page.total,
    ),
    data: page.rows,
  };

  return Response.json(body, {
    status: 200,
    headers: {
      ...NO_STORE,
      ...rateLimitHeaders(after),
      "X-API-Dataset": dataset.slug,
      "X-API-License": dataset.license,
    },
  });
}
