import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F80 — punto 3: `getUserHoldings` pide solo las columnas que los consumidores
 * usan. Antes era `select("*")`, que arrastraba `id`, `user_id` y `created_at`.
 *
 * Sin Supabase real: se mockea el cliente y se captura el string del select.
 */
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  thenable: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => null),
}));

import { getUserHoldings } from "@/lib/queries";

beforeEach(() => {
  vi.clearAllMocks();

  // Builder encadenable: select -> eq -> order -> await.
  const builder = {
    select: mocks.select,
    eq: mocks.eq,
    order: mocks.order,
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({ data: [], error: null }).then(resolve, reject),
  };
  mocks.select.mockReturnValue(builder);
  mocks.eq.mockReturnValue(builder);
  mocks.order.mockReturnValue(builder);

  mocks.createClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.from.mockReturnValue(builder);
});

describe("F80: getUserHoldings pide solo las columnas necesarias", () => {
  it("el select lista las columnas que usan los consumidores", async () => {
    await getUserHoldings();

    expect(mocks.select).toHaveBeenCalledTimes(1);
    const columns = mocks.select.mock.calls[0][0] as string;
    expect(columns).toBe(
      "symbol,name,weight,quantity,avg_cost,market,currency",
    );
  });

  it("no pide todas las columnas ni las que no se usan", async () => {
    await getUserHoldings();

    const columns = (mocks.select.mock.calls[0][0] as string)
      .split(",")
      .map((column) => column.trim());
    expect(columns).not.toContain("*");
    expect(columns).not.toContain("id");
    expect(columns).not.toContain("user_id");
    expect(columns).not.toContain("created_at");
    // Las que sí usan los consumidores.
    expect(columns).toContain("symbol");
    expect(columns).toContain("name");
    expect(columns).toContain("weight");
  });
});
