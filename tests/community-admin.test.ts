import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Panel /admin/comunidad (F49-B): ningún fetch real, ningún Supabase real.
 * El cliente admin se reemplaza por un doble en memoria. La comunidad solo se
 * enciende con COMMUNITY_ENABLED === "true".
 */

const NOT_FOUND = "NEXT_NOT_FOUND";

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  rows: [] as Record<string, unknown>[],
  updates: [] as { table: string; id: string; values: Record<string, unknown> }[],
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => {
  function makeBuilder(table: string) {
    const query = {
      operation: "select" as "select" | "update",
      values: null as Record<string, unknown> | null,
      filters: {} as Record<string, unknown>,
    };

    const api = {
      select() {
        return api;
      },
      update(values: Record<string, unknown>) {
        query.operation = "update";
        query.values = values;
        return api;
      },
      eq(column: string, value: unknown) {
        query.filters[column] = value;
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      async maybeSingle() {
        const match = state.rows.find((row) =>
          Object.entries(query.filters).every(([key, value]) => row[key] === value),
        );
        return { data: match ?? null, error: null };
      },
      then(
        onFulfilled: (value: { data: null; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        if (query.operation === "update" && query.values) {
          for (const row of state.rows) {
            const matches = Object.entries(query.filters).every(
              ([key, value]) => row[key] === value,
            );
            if (!matches) continue;
            Object.assign(row, query.values);
            state.updates.push({
              table,
              id: String(row.id),
              values: query.values,
            });
          }
        }
        return Promise.resolve({ data: null, error: null }).then(
          onFulfilled,
          onRejected,
        );
      },
    };

    return api;
  }

  return {
    createAdminClient: () => ({ from: (table: string) => makeBuilder(table) }),
  };
});

import {
  approvePortfolio,
  rejectPortfolio,
  verifyCreator,
} from "@/app/admin/comunidad/actions";

const PORTFOLIO_ID = "22222222-2222-4222-a222-222222222222";
const PROFILE_ID = "33333333-3333-4333-a333-333333333333";
const ADMIN_EMAIL = "admin@example.com";

const ENV_KEYS = ["ADMIN_EMAILS", "COMMUNITY_ENABLED"] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function form(id: string): FormData {
  const data = new FormData();
  data.set("id", id);
  return data;
}

function asAdmin(): void {
  state.user = { id: "99999999-9999-4999-a999-999999999999", email: ADMIN_EMAIL };
  process.env.ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.COMMUNITY_ENABLED = "true";
}

beforeEach(() => {
  state.user = null;
  state.rows = [];
  state.updates = [];
  delete process.env.ADMIN_EMAILS;
  delete process.env.COMMUNITY_ENABLED;
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
});

describe("acciones de moderación de la comunidad", () => {
  it("cada acción exige admin y responde notFound si no lo es", async () => {
    state.user = { id: "user-1", email: "persona@example.com" };
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    process.env.COMMUNITY_ENABLED = "true";

    await expect(approvePortfolio({}, form(PORTFOLIO_ID))).rejects.toThrow(
      NOT_FOUND,
    );
    await expect(rejectPortfolio({}, form(PORTFOLIO_ID))).rejects.toThrow(
      NOT_FOUND,
    );
    await expect(verifyCreator({}, form(PROFILE_ID))).rejects.toThrow(NOT_FOUND);
    expect(state.updates).toHaveLength(0);
  });

  it("sin sesión también responde notFound", async () => {
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    process.env.COMMUNITY_ENABLED = "true";

    await expect(approvePortfolio({}, form(PORTFOLIO_ID))).rejects.toThrow(
      NOT_FOUND,
    );
    await expect(verifyCreator({}, form(PROFILE_ID))).rejects.toThrow(NOT_FOUND);
  });

  it("rechaza ids que no son uuid antes de tocar la base", async () => {
    asAdmin();
    state.rows = [
      { id: PORTFOLIO_ID, estado: "pending" },
      { id: PROFILE_ID, verificado: false },
    ];

    for (const action of [approvePortfolio, rejectPortfolio, verifyCreator]) {
      const result = await action({}, form("no-es-un-uuid"));
      expect(result.error).toMatch(/id/i);
      expect(state.updates).toHaveLength(0);
    }
  });

  it("con la comunidad apagada no escribe y avisa", async () => {
    state.user = { id: "99999999-9999-4999-a999-999999999999", email: ADMIN_EMAIL };
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    delete process.env.COMMUNITY_ENABLED;
    state.rows = [
      { id: PORTFOLIO_ID, estado: "pending" },
      { id: PROFILE_ID, verificado: false },
    ];

    const approve = await approvePortfolio({}, form(PORTFOLIO_ID));
    const verify = await verifyCreator({}, form(PROFILE_ID));

    expect(approve.error).toContain("apagada");
    expect(verify.error).toContain("apagada");
    expect(state.rows[0].estado).toBe("pending");
    expect(state.rows[1].verificado).toBe(false);
    expect(state.updates).toHaveLength(0);
  });

  it("aprobar deja la cartera aprobada y registra al moderador", async () => {
    asAdmin();
    state.rows = [{ id: PORTFOLIO_ID, estado: "pending", moderated_by: null }];

    const result = await approvePortfolio({}, form(PORTFOLIO_ID));

    expect(result.success).toContain("aprobada");
    expect(state.rows[0].estado).toBe("approved");
    expect(state.rows[0].moderated_by).toBe(state.user?.id);
    expect(typeof state.rows[0].moderated_at).toBe("string");
  });

  it("rechazar deja la cartera rechazada", async () => {
    asAdmin();
    state.rows = [{ id: PORTFOLIO_ID, estado: "pending" }];

    const result = await rejectPortfolio({}, form(PORTFOLIO_ID));

    expect(result.success).toContain("rechazada");
    expect(state.rows[0].estado).toBe("rejected");
  });

  it("verificar marca el perfil como verificado en la tabla correcta", async () => {
    asAdmin();
    state.rows = [{ id: PROFILE_ID, verificado: false }];

    const result = await verifyCreator({}, form(PROFILE_ID));

    expect(result.success).toContain("verificado");
    expect(state.rows[0].verificado).toBe(true);
    expect(state.updates[0]?.table).toBe("creator_profiles");
  });
});
