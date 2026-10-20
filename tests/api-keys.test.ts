import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  API_DAILY_LIMITS,
  API_KEY_PREFIX,
  API_MAX_ACTIVE_KEYS,
  activeApiKeyLimitReached,
  apiDailyLimit,
  apiDayKey,
  apiPublicEnabled,
  authenticateApiKey,
  extractBearerToken,
  generateApiKey,
  hashApiKey,
  isApiKeyFormat,
  normalizeApiPlan,
  rateLimit,
  rateLimitHeaders,
  verifyApiKey,
} from "@/lib/api-keys";

const ORIGINAL_FLAG = process.env.API_PUBLIC_ENABLED;

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.API_PUBLIC_ENABLED;
  else process.env.API_PUBLIC_ENABLED = ORIGINAL_FLAG;
});

function recordFor(key: ReturnType<typeof generateApiKey>, overrides = {}) {
  return {
    prefix: key.prefix,
    key_hash: key.hash,
    plan: "pro",
    revoked: false,
    ...overrides,
  };
}

describe("generateApiKey", () => {
  it("genera una clave con formato rcl_<12 hex>_<43>", () => {
    const key = generateApiKey();
    expect(key.plaintext.startsWith(`${API_KEY_PREFIX}_`)).toBe(true);
    expect(isApiKeyFormat(key.plaintext)).toBe(true);
    expect(key.prefix).toMatch(/^rcl_[a-f0-9]{12}$/);
    expect(key.plaintext.startsWith(`${key.prefix}_`)).toBe(true);
  });

  it("guarda solo el sha256 de la clave, nunca el claro", () => {
    const key = generateApiKey();
    expect(key.hash).toBe(createHash("sha256").update(key.plaintext).digest("hex"));
    expect(key.hash).toHaveLength(64);
    expect(key.hash).not.toContain(key.plaintext);
  });

  it("no repite claves ni prefijos", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 50; i += 1) keys.add(generateApiKey().plaintext);
    expect(keys.size).toBe(50);
  });
});

describe("hashApiKey / verifyApiKey", () => {
  it("es determinista", () => {
    expect(hashApiKey("rcl_test")).toBe(hashApiKey("rcl_test"));
    expect(hashApiKey("rcl_test")).not.toBe(hashApiKey("rcl_otra"));
  });

  it("acepta la clave correcta y rechaza otra", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(verifyApiKey(a.plaintext, a.hash)).toBe(true);
    expect(verifyApiKey(b.plaintext, a.hash)).toBe(false);
  });

  it("falla cerrado con hash ausente o mal formado", () => {
    const a = generateApiKey();
    expect(verifyApiKey(a.plaintext, null)).toBe(false);
    expect(verifyApiKey(a.plaintext, "")).toBe(false);
    expect(verifyApiKey(a.plaintext, "no-es-un-hash")).toBe(false);
    expect(verifyApiKey("", a.hash)).toBe(false);
  });
});

describe("extractBearerToken", () => {
  it("lee Bearer sin importar mayúsculas ni espacios extra", () => {
    expect(extractBearerToken("Bearer rcl_abc")).toBe("rcl_abc");
    expect(extractBearerToken("  bearer   rcl_abc  ")).toBe("rcl_abc");
  });

  it("devuelve null si falta o el esquema es otro", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
  });
});

describe("apiPublicEnabled", () => {
  it("solo se enciende con el valor exacto true", () => {
    process.env.API_PUBLIC_ENABLED = "true";
    expect(apiPublicEnabled()).toBe(true);

    for (const value of ["1", "TRUE", "yes", "false", ""]) {
      process.env.API_PUBLIC_ENABLED = value;
      expect(apiPublicEnabled()).toBe(false);
    }

    delete process.env.API_PUBLIC_ENABLED;
    expect(apiPublicEnabled()).toBe(false);
  });
});

describe("planes y límite diario", () => {
  it("normaliza planes desconocidos a free", () => {
    expect(normalizeApiPlan("elite")).toBe("elite");
    expect(normalizeApiPlan("pro")).toBe("pro");
    expect(normalizeApiPlan("free")).toBe("free");
    expect(normalizeApiPlan("enterprise")).toBe("free");
    expect(normalizeApiPlan(null)).toBe("free");
  });

  it("el límite crece con el plan", () => {
    expect(apiDailyLimit("free")).toBe(API_DAILY_LIMITS.free);
    expect(apiDailyLimit("pro")).toBeGreaterThan(API_DAILY_LIMITS.free);
    expect(apiDailyLimit("elite")).toBeGreaterThan(API_DAILY_LIMITS.pro);
    expect(apiDailyLimit("desconocido")).toBe(API_DAILY_LIMITS.free);
  });

  it("usa el día UTC", () => {
    expect(apiDayKey(new Date("2026-10-20T23:59:59Z"))).toBe("2026-10-20");
    expect(apiDayKey(Date.parse("2026-10-21T00:00:00Z"))).toBe("2026-10-21");
  });
});

describe("rateLimit", () => {
  it("permite mientras quede cupo", () => {
    const decision = rateLimit({
      plan: "free",
      used: API_DAILY_LIMITS.free - 1,
      day: "2026-10-20",
      today: "2026-10-20",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(1);
    expect(decision.stale).toBe(false);
  });

  it("bloquea al llegar al límite", () => {
    const decision = rateLimit({
      plan: "free",
      used: API_DAILY_LIMITS.free,
      day: "2026-10-20",
      today: "2026-10-20",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });

  it("reinicia el contador cuando cambia el día", () => {
    const decision = rateLimit({
      plan: "free",
      used: API_DAILY_LIMITS.free,
      day: "2026-10-19",
      today: "2026-10-20",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.stale).toBe(true);
    expect(decision.used).toBe(0);
    expect(decision.remaining).toBe(API_DAILY_LIMITS.free);
  });

  it("un plan mayor tiene más margen con el mismo consumo", () => {
    const used = API_DAILY_LIMITS.free;
    expect(
      rateLimit({ plan: "free", used, day: "2026-10-20", today: "2026-10-20" }).allowed,
    ).toBe(false);
    expect(
      rateLimit({ plan: "pro", used, day: "2026-10-20", today: "2026-10-20" }).allowed,
    ).toBe(true);
  });

  it("expone cabeceras coherentes", () => {
    const headers = rateLimitHeaders(
      rateLimit({ plan: "pro", used: 10, day: "2026-10-20", today: "2026-10-20" }),
    );
    expect(headers["X-RateLimit-Limit"]).toBe(String(API_DAILY_LIMITS.pro));
    expect(headers["X-RateLimit-Remaining"]).toBe(
      String(API_DAILY_LIMITS.pro - 10),
    );
    expect(headers["X-RateLimit-Reset"]).toBe("2026-10-20");
  });
});

describe("authenticateApiKey", () => {
  it("con la API apagada responde 503 sin mirar la clave", () => {
    const key = generateApiKey();
    const result = authenticateApiKey(`Bearer ${key.plaintext}`, recordFor(key), false);
    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "La API pública no está habilitada.",
    });
  });

  it("sin Authorization responde 401", () => {
    const result = authenticateApiKey(null, null, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toContain("Bearer");
    }
  });

  it("con una clave inexistente responde 401", () => {
    const key = generateApiKey();
    const result = authenticateApiKey(`Bearer ${key.plaintext}`, null, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toBe("Clave de API inválida.");
    }
  });

  it("con una clave que no corresponde al registro responde 401", () => {
    const stored = generateApiKey();
    const presented = generateApiKey();
    const result = authenticateApiKey(
      `Bearer ${presented.plaintext}`,
      recordFor(stored),
      true,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("una clave revocada responde 401 con el mismo mensaje genérico", () => {
    const key = generateApiKey();
    const result = authenticateApiKey(
      `Bearer ${key.plaintext}`,
      recordFor(key, { revoked: true }),
      true,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toBe("Clave de API inválida.");
    }
  });

  it("una clave válida devuelve plan y límite", () => {
    const key = generateApiKey();
    const result = authenticateApiKey(
      `Bearer ${key.plaintext}`,
      recordFor(key, { plan: "elite" }),
      true,
    );
    expect(result).toEqual({
      ok: true,
      prefix: key.prefix,
      plan: "elite",
      limit: API_DAILY_LIMITS.elite,
    });
  });

  it("un plan desconocido en la fila cae a Gratis", () => {
    const key = generateApiKey();
    const result = authenticateApiKey(
      `Bearer ${key.plaintext}`,
      recordFor(key, { plan: "enterprise" }),
      true,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan).toBe("free");
  });
});

describe("tope de claves activas", () => {
  it("permite crear mientras haya cupo y bloquea en 5", () => {
    expect(API_MAX_ACTIVE_KEYS).toBe(5);
    expect(activeApiKeyLimitReached(0)).toBe(false);
    expect(activeApiKeyLimitReached(API_MAX_ACTIVE_KEYS - 1)).toBe(false);
    expect(activeApiKeyLimitReached(API_MAX_ACTIVE_KEYS)).toBe(true);
    expect(activeApiKeyLimitReached(API_MAX_ACTIVE_KEYS + 3)).toBe(true);
  });

  it("normaliza conteos inválidos sin romper", () => {
    expect(activeApiKeyLimitReached(-1)).toBe(false);
    expect(activeApiKeyLimitReached(Number.NaN)).toBe(false);
  });
});
