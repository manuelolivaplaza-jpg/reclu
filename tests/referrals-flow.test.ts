import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
} from "@/lib/referrals";
import {
  getBillingServiceClient,
  type BillingServiceClient,
} from "@/lib/billing/supabase-admin";
import { rewardReferralOnFirstPayment } from "@/lib/billing/completer";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

vi.mock("@/lib/billing/supabase-admin", () => ({
  getBillingServiceClient: vi.fn(),
}));

describe("cookie de referido en el proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("con el flag apagado no escribe cookie aunque ?ref sea válido", async () => {
    const { updateSession } = await import("@/lib/supabase/middleware");
    const request = new NextRequest("https://reclu.cl/?ref=ABC123");
    const response = await updateSession(request);
    expect(response.cookies.get(REFERRAL_COOKIE)).toBeUndefined();
  });

  it("con REFERRALS_ENABLED=true guarda el código 30 días, httpOnly y lax", async () => {
    vi.stubEnv("REFERRALS_ENABLED", "true");
    const { updateSession } = await import("@/lib/supabase/middleware");
    const request = new NextRequest("https://reclu.cl/?ref=ABC123");
    const response = await updateSession(request);
    const cookie = response.cookies.get(REFERRAL_COOKIE);
    expect(cookie?.value).toBe("ABC123");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.maxAge).toBe(REFERRAL_COOKIE_MAX_AGE);
    expect(cookie?.path).toBe("/");
  });

  it("ignora códigos inválidos", async () => {
    vi.stubEnv("REFERRALS_ENABLED", "true");
    const { updateSession } = await import("@/lib/supabase/middleware");
    const request = new NextRequest("https://reclu.cl/?ref=no%20vale");
    const response = await updateSession(request);
    expect(response.cookies.get(REFERRAL_COOKIE)).toBeUndefined();
  });
});

/** Cliente falso: una fila pending que pasa a rewarded al llamar la RPC. */
function fakeReferralClient(options: { pending: boolean; rpcError?: string }) {
  const rpc = vi.fn(async () => {
    options.pending = false;
    return { data: true, error: options.rpcError ? { message: options.rpcError } : null };
  });
  const client = {
    from: (table: string) => {
      expect(table).toBe("referrals");
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options.pending ? { id: "ref-1" } : null,
                error: null,
              }),
            }),
          }),
        }),
      };
    },
    rpc,
  };
  return { client, rpc };
}

describe("recompensa de referido en el primer pago", () => {
  const mockedGetClient = vi.mocked(getBillingServiceClient);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("con el flag apagado no consulta ni llama la RPC", async () => {
    const { client, rpc } = fakeReferralClient({ pending: true });
    mockedGetClient.mockReturnValue(client as unknown as BillingServiceClient);
    await rewardReferralOnFirstPayment("referred-1");
    expect(rpc).not.toHaveBeenCalled();
    expect(mockedGetClient).not.toHaveBeenCalled();
  });

  it("primer pago confirmado: llama reward_referral una vez", async () => {
    vi.stubEnv("REFERRALS_ENABLED", "true");
    const { client, rpc } = fakeReferralClient({ pending: true });
    mockedGetClient.mockReturnValue(client as unknown as BillingServiceClient);
    await rewardReferralOnFirstPayment("referred-1");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("reward_referral", { p_referred: "referred-1" });
  });

  it("segundo pago: no vuelve a premiar (la fila ya está rewarded)", async () => {
    vi.stubEnv("REFERRALS_ENABLED", "true");
    const { client, rpc } = fakeReferralClient({ pending: true });
    mockedGetClient.mockReturnValue(client as unknown as BillingServiceClient);
    await rewardReferralOnFirstPayment("referred-1");
    await rewardReferralOnFirstPayment("referred-1");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("si la RPC falla, no lanza (el pago sigue su curso)", async () => {
    vi.stubEnv("REFERRALS_ENABLED", "true");
    const { client } = fakeReferralClient({ pending: true, rpcError: "boom" });
    mockedGetClient.mockReturnValue(client as unknown as BillingServiceClient);
    await expect(rewardReferralOnFirstPayment("referred-1")).resolves.toBeUndefined();
  });
});
