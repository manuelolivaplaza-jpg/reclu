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

// ---- Signup: alta del vínculo referrer → invitado (service role) ----

const signupState = vi.hoisted(() => ({
  cookie: null as string | null,
  signUpResult: { data: { user: null, session: null }, error: null } as {
    data: { user: { id: string } | null; session: unknown };
    error: { status: number; message: string } | null;
  },
  referrer: null as { id: string } | null,
  inserts: [] as Array<Record<string, unknown>>,
  insertError: null as { code?: string; message: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signUp: async () => signupState.signUpResult },
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      signupState.cookie ? { name, value: signupState.cookie } : undefined,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/supabase/service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (column: string, value: string) => ({
              maybeSingle: async () => {
                expect(column).toBe("referral_code");
                expect(value).toBe("ABC123");
                return { data: signupState.referrer, error: null };
              },
            }),
          }),
        };
      }
      return {
        insert: async (row: Record<string, unknown>) => {
          if (signupState.insertError) return { error: signupState.insertError };
          signupState.inserts.push(row);
          return { error: null };
        },
      };
    },
  }),
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

describe("signUp: alta del referido", () => {
  beforeEach(() => {
    signupState.cookie = "ABC123";
    signupState.referrer = { id: "referrer-1" };
    signupState.inserts = [];
    signupState.insertError = null;
    signupState.signUpResult = {
      data: { user: { id: "invited-1" }, session: null },
      error: null,
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function makeForm(): FormData {
    const form = new FormData();
    form.set("email", "invitado@correo.cl");
    form.set("password", "password123");
    return form;
  }

  it("con el flag apagado no inserta nada", async () => {
    const { signUp } = await import("@/app/actions/auth");
    const state = await signUp({}, makeForm());
    expect(state.success).toContain("Cuenta creada");
    expect(signupState.inserts).toHaveLength(0);
  });

  it("con flag y cookie válida registra referrer y referred", async () => {
    vi.stubEnv("REFERRALS_ENABLED", "true");
    const { signUp } = await import("@/app/actions/auth");
    await signUp({}, makeForm());
    expect(signupState.inserts).toEqual([
      { referrer_id: "referrer-1", referred_id: "invited-1" },
    ]);
  });

  it("no registra autorreferidos", async () => {
    vi.stubEnv("REFERRALS_ENABLED", "true");
    signupState.referrer = { id: "invited-1" };
    const { signUp } = await import("@/app/actions/auth");
    await signUp({}, makeForm());
    expect(signupState.inserts).toHaveLength(0);
  });

  it("un fallo al insertar no rompe el signup ni cambia el mensaje", async () => {
    vi.stubEnv("REFERRALS_ENABLED", "true");
    signupState.insertError = { message: "boom" };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { signUp } = await import("@/app/actions/auth");
    const state = await signUp({}, makeForm());
    expect(state.success).toContain("Cuenta creada");
    expect(state.error).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("un error de Supabase mantiene el mensaje genérico (sin tocar referidos)", async () => {
    vi.stubEnv("REFERRALS_ENABLED", "true");
    signupState.signUpResult = {
      data: { user: null, session: null },
      error: { status: 400, message: "User already registered" },
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { signUp } = await import("@/app/actions/auth");
    const state = await signUp({}, makeForm());
    expect(state.error).toBe("Si el correo es válido, te enviamos un enlace para continuar.");
    expect(signupState.inserts).toHaveLength(0);
    errorSpy.mockRestore();
  });
});
