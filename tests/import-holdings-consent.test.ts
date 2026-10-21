import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F75B: la importación CSV también queda bloqueada sin consentimiento
 * vigente. Sin Supabase real: se mockea el cliente de sesión.
 */
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  deleteFn: vi.fn(),
  deleteEq: vi.fn(),
  insert: vi.fn(),
  revalidatePath: vi.fn(),
  profileSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { importHoldings } from "@/app/actions/holdings";
import { PORTFOLIO_CONSENT_VERSION } from "@/lib/portfolio-consent";

const ORIGINAL_FLAG = process.env.MY_PORTFOLIO_ENABLED;
const CSV = "symbol,quantity\nAAPL,10\nMSFT,5\n";

function table(name: string) {
  if (name === "user_portfolio_settings") {
    return { select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) };
  }
  if (name === "profiles") {
    return { select: () => ({ eq: () => ({ single: mocks.profileSingle }) }) };
  }
  if (name === "user_holdings") {
    return {
      delete: mocks.deleteFn,
      insert: mocks.insert,
    };
  }
  throw new Error(`tabla inesperada: ${name}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MY_PORTFOLIO_ENABLED = "true";

  mocks.createClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.from.mockImplementation(table);
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.deleteFn.mockReturnValue({ eq: mocks.deleteEq });
  mocks.deleteEq.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.profileSingle.mockResolvedValue({ data: { plan: "free", trial_ends_at: null }, error: null });
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.MY_PORTFOLIO_ENABLED;
  else process.env.MY_PORTFOLIO_ENABLED = ORIGINAL_FLAG;
});

describe("importHoldings: consentimiento", () => {
  it("sin consentimiento no importa ni reemplaza la cartera", async () => {
    const result = await importHoldings(CSV);

    expect(result.error).toMatch(/consentimiento/i);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("una versión vieja obliga a aceptar de nuevo", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        consent_at: "2026-10-01T12:00:00Z",
        consent_version: "2026-10-01.v0",
      },
      error: null,
    });

    const result = await importHoldings(CSV);

    expect(result.error).toMatch(/de nuevo/i);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("con consentimiento vigente importa el CSV", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        consent_at: "2026-10-20T12:00:00Z",
        consent_version: PORTFOLIO_CONSENT_VERSION,
      },
      error: null,
    });

    const result = await importHoldings(CSV);

    expect(result.error).toBeUndefined();
    expect(result.success).toMatch(/2 activos/);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("M1: con el flag apagado (/compare) tambien exige consentimiento", async () => {
    delete process.env.MY_PORTFOLIO_ENABLED;

    const result = await importHoldings(CSV);

    expect(result.error).toMatch(/consentimiento/i);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("importHoldings: tope del plan (F77 M2)", () => {
  it("un CSV sobre el tope no borra la cartera actual", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { consent_at: "2026-10-20T12:00:00Z", consent_version: PORTFOLIO_CONSENT_VERSION },
      error: null,
    });
    const rows = Array.from({ length: 11 }, (_, i) => `T${String.fromCharCode(65 + i)}X,1`);
    const result = await importHoldings(`symbol,quantity\n${rows.join("\n")}\n`);

    expect(result.error).toMatch(/no se modific/i);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
