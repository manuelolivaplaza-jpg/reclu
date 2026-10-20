import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Panel /admin/publicaciones: ningún fetch real, ningún Supabase real.
 * El cliente admin se reemplaza por un doble en memoria.
 */

const NOT_FOUND = "NEXT_NOT_FOUND";

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  rows: [] as Record<string, unknown>[],
  updates: [] as { id: string; values: Record<string, unknown> }[],
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
  function makeBuilder() {
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
            state.updates.push({ id: String(row.id), values: query.values });
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
    createAdminClient: () => ({ from: () => makeBuilder() }),
  };
});

import {
  approveDraft,
  editDraft,
  rejectDraft,
  sendDraft,
} from "@/app/admin/publicaciones/actions";
import type { Draft } from "@/lib/publish/types";

const DRAFT_ID = "11111111-1111-4111-a111-111111111111";
const ADMIN_EMAIL = "admin@example.com";

const ENV_KEYS = [
  "ADMIN_EMAILS",
  "PUBLISH_MODE",
  "PUBLISH_X_ENABLED",
  "PUBLISH_TELEGRAM_ENABLED",
  "PUBLISH_NEWSLETTER_ENABLED",
] as const;

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

function draft(overrides: Partial<Draft> = {}): Record<string, unknown> {
  const value: Draft = {
    id: DRAFT_ID,
    channel: "x",
    body: "Cambio público en una cartera seguida.",
    payload: {},
    source_alert_id: null,
    status: "draft",
    preview_url: null,
    created_at: "2026-10-20T00:00:00.000Z",
    approved_by: null,
    approved_at: null,
    sent_at: null,
    external_id: null,
    error: null,
    ...overrides,
  };
  return value as unknown as Record<string, unknown>;
}

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("id", DRAFT_ID);
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function asAdmin(): void {
  state.user = { id: "99999999-9999-4999-a999-999999999999", email: ADMIN_EMAIL };
  process.env.ADMIN_EMAILS = ADMIN_EMAIL;
}

beforeEach(() => {
  state.user = null;
  state.rows = [];
  state.updates = [];
  delete process.env.ADMIN_EMAILS;
  delete process.env.PUBLISH_MODE;
  delete process.env.PUBLISH_X_ENABLED;
  delete process.env.PUBLISH_TELEGRAM_ENABLED;
  delete process.env.PUBLISH_NEWSLETTER_ENABLED;
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
});

describe("acciones del panel", () => {
  it("cada acción exige admin y responde notFound si no lo es", async () => {
    state.user = { id: "user-1", email: "persona@example.com" };
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;

    await expect(approveDraft({}, form())).rejects.toThrow(NOT_FOUND);
    await expect(rejectDraft({}, form({ reason: "" }))).rejects.toThrow(NOT_FOUND);
    await expect(editDraft({}, form({ body: "texto" }))).rejects.toThrow(NOT_FOUND);
    await expect(sendDraft({}, form())).rejects.toThrow(NOT_FOUND);
  });

  it("sin sesión también responde notFound", async () => {
    state.user = null;
    await expect(approveDraft({}, form())).rejects.toThrow(NOT_FOUND);
  });

  it("rechaza ids que no son uuid antes de tocar la base", async () => {
    asAdmin();
    const bad = form();
    bad.set("id", "no-es-un-uuid");

    for (const action of [approveDraft, rejectDraft, editDraft, sendDraft]) {
      const result = await action({}, bad);
      expect(result.error).toContain("id");
      expect(state.updates).toHaveLength(0);
    }
  });

  it("enviar con el canal apagado devuelve skipped sin llamar fetch", async () => {
    asAdmin();
    state.rows = [draft({ status: "approved", channel: "x" })];
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await sendDraft({}, form());

    expect(result.error).toBeUndefined();
    expect(result.success).toContain("omitido");
    expect(result.success?.toLowerCase()).toContain("apagado");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.rows[0].status).toBe("approved");
    expect(state.updates).toHaveLength(0);
  });

  it("no envía un borrador que no está aprobado", async () => {
    asAdmin();
    state.rows = [draft({ status: "draft", channel: "x" })];
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await sendDraft({}, form());

    expect(result.error).toContain("aprobados");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("aprobar guarda el usuario y deja el borrador listo para enviar", async () => {
    asAdmin();
    state.rows = [draft({ status: "draft" })];

    const result = await approveDraft({}, form());

    expect(result.success).toContain("aprobado");
    expect(state.rows[0].status).toBe("approved");
    expect(state.rows[0].approved_by).toBe(state.user?.id);
  });

  it("editar un aprobado lo devuelve a pendiente", async () => {
    asAdmin();
    state.rows = [draft({ status: "approved", body: "viejo" })];

    const result = await editDraft({}, form({ body: "texto nuevo" }));

    expect(result.success).toContain("pendiente");
    expect(state.rows[0].status).toBe("draft");
    expect(state.rows[0].body).toBe("texto nuevo");
    expect(state.rows[0].approved_by).toBeNull();
  });
});
