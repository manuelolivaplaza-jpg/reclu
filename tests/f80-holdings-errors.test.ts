import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F80 — punto 1: los mensajes crudos de Supabase nunca llegan al usuario.
 *
 * Sin Supabase real: se mockea el cliente de sesión para que cada operación
 * (delete, upsert, insert) falle con un mensaje interno que NO puede aparecer
 * en la respuesta ni en los logs.
 */
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  insert: vi.fn(),
  revalidatePath: vi.fn(),
  /** Error de la operación de borrado (se puede dejar en null). */
  deleteError: null as null | { message: string; code?: string },
  /** Error de la operación de escritura (upsert/insert). */
  writeError: null as null | { message: string; code?: string },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import {
  clearUserHoldings,
  importHoldings,
  saveUserHoldings,
} from "@/app/actions/holdings";
import { PORTFOLIO_CONSENT_VERSION } from "@/lib/portfolio-consent";

/** Mensaje interno de Postgres que nunca debe filtrarse. */
const SECRET =
  'duplicate key value violates unique constraint "user_holdings_user_symbol_key"';

/**
 * Builder de `delete` que sirve para las dos formas de uso del código:
 * `delete().eq(...)` (await directo) y `delete().eq(...).in(...)`.
 */
function deleteBuilder() {
  const builder = {
    eq: vi.fn(() => builder),
    in: vi.fn(async () => ({ error: mocks.deleteError })),
    then: (
      resolve: (value: { error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ error: mocks.deleteError }).then(resolve, reject),
  };
  return builder;
}

function table(name: string) {
  if (name === "profiles") {
    return { select: () => ({ eq: () => ({ single: mocks.single }) }) };
  }
  if (name === "user_portfolio_settings") {
    return { select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) };
  }
  if (name === "user_holdings") {
    return {
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
      upsert: mocks.upsert,
      insert: mocks.insert,
      delete: deleteBuilder,
    };
  }
  throw new Error(`tabla inesperada: ${name}`);
}

let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteError = { message: SECRET, code: "23505" };
  mocks.writeError = { message: SECRET, code: "23505" };

  mocks.createClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.from.mockImplementation(table);

  mocks.single.mockResolvedValue({
    data: { plan: "free", trial_ends_at: null },
    error: null,
  });
  mocks.maybeSingle.mockResolvedValue({
    data: {
      consent_at: "2026-10-20T12:00:00Z",
      consent_version: PORTFOLIO_CONSENT_VERSION,
    },
    error: null,
  });

  mocks.upsert.mockResolvedValue({ error: mocks.writeError });
  mocks.insert.mockResolvedValue({ error: mocks.writeError });

  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  consoleWarn.mockRestore();
});

/** Todo lo que se registró en consola, en texto plano. */
function logged(): string {
  return [...consoleError.mock.calls, ...consoleWarn.mock.calls]
    .map((call) => call.map((value) => String(value)).join(" "))
    .join("\n");
}

describe("F80: saveUserHoldings no filtra el mensaje crudo de Supabase", () => {
  it("el upsert fallido devuelve un mensaje genérico en español", async () => {
    const result = await saveUserHoldings([{ symbol: "AAPL", weight: 100 }]);

    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain(SECRET);
    expect(result.error).not.toMatch(/user_holdings_user_symbol_key|constraint/i);
    expect(result.error).toMatch(/no pudimos guardar tu cartera/i);
  });

  it("el log registra solo el código del error", async () => {
    await saveUserHoldings([{ symbol: "AAPL", weight: 100 }]);

    const text = logged();
    expect(text).toContain("23505");
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("constraint");
  });

  it("el borrado de símbolos quitados también es genérico", async () => {
    // Hay una posición guardada que el usuario quitó: se dispara el delete.
    mocks.from.mockImplementation((name: string) => {
      if (name === "user_holdings") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [{ symbol: "MSFT" }],
                error: null,
              }),
          }),
          upsert: mocks.upsert,
          insert: mocks.insert,
          delete: deleteBuilder,
        };
      }
      return table(name);
    });

    const result = await saveUserHoldings([{ symbol: "AAPL", weight: 100 }]);

    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain(SECRET);
    expect(result.error).toMatch(/no pudimos borrar tu cartera/i);
  });
});

describe("F80: importHoldings no filtra el mensaje crudo de Supabase", () => {
  it("el borrado previo devuelve un mensaje genérico", async () => {
    const result = await importHoldings("symbol,quantity\nAAPL,10\n");

    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain(SECRET);
    expect(result.error).toMatch(/no pudimos borrar tu cartera/i);
  });

  it("el insert devuelve un mensaje genérico y no el detalle interno", async () => {
    mocks.deleteError = null;

    const result = await importHoldings("symbol,quantity\nAAPL,10\n");

    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain(SECRET);
    expect(result.error).toMatch(/no pudimos guardar tu cartera/i);
    expect(logged()).not.toContain(SECRET);
  });
});

describe("F80: clearUserHoldings no filtra el mensaje crudo de Supabase", () => {
  it("devuelve un mensaje genérico", async () => {
    const result = await clearUserHoldings();

    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain(SECRET);
    expect(result.error).toMatch(/no pudimos borrar tu cartera/i);
    expect(logged()).not.toContain(SECRET);
  });
});
