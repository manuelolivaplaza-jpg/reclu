import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  X_MAX_LENGTH,
  X_TWEET_URL,
  hmacSha1,
  oauthHeader,
  percentEncode,
  readXEnv,
  signatureBase,
  signingKey,
  weightedLength,
  xPublisher,
} from "@/lib/publish/x";
import type { Draft } from "@/lib/publish/types";

const X_ENV_KEYS = [
  "X_API_KEY",
  "X_API_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_SECRET",
  "X_BEARER_TOKEN",
] as const;

const originalEnv = new Map<string, string | undefined>(
  X_ENV_KEYS.map((key) => [key, process.env[key]]),
);

const CREDENTIALS = {
  X_API_KEY: "ck-test",
  X_API_SECRET: "cs-test",
  X_ACCESS_TOKEN: "tk-test",
  X_ACCESS_SECRET: "ts-test",
};

beforeEach(() => {
  for (const key of X_ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of X_ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setCredentials(): void {
  for (const [key, value] of Object.entries(CREDENTIALS)) process.env[key] = value;
}

function draft(body = "Un cambio público en una cartera seguida."): Draft {
  return {
    id: "draft-x-1",
    channel: "x",
    body,
    payload: {},
    source_alert_id: null,
    status: "approved",
    preview_url: null,
    created_at: "2026-10-19T00:00:00.000Z",
    approved_by: null,
    approved_at: null,
    sent_at: null,
    external_id: null,
    error: null,
  };
}

/** Separa la cabecera OAuth en pares decodificados. */
function parseOAuthHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.replace(/^OAuth /, "").split(", ")) {
    const index = part.indexOf("=");
    const key = part.slice(0, index);
    const raw = part.slice(index + 1).replace(/^"|"$/g, "");
    out[decodeURIComponent(key)] = decodeURIComponent(raw);
  }
  return out;
}

describe("OAuth 1.0a: vector de la documentación de X", () => {
  /**
   * Ejemplo "Creating a signature" de la documentación oficial de X:
   * https://developer.x.com/en/docs/authentication/oauth-1-0a/creating-a-signature
   *
   * Ese ejemplo es form-encoded (v1.1), así que `status` y
   * `include_entities` entran en la base de firma. Aquí se comprueba
   * únicamente el algoritmo (base de firma + clave + HMAC-SHA1), no el
   * `oauthHeader` de producción, que firma JSON y por eso excluye el cuerpo.
   */
  it("reproduce la firma publicada hCtSmYh+iHYCEqBWrE7C7hYmtUk=", () => {
    const params = {
      include_entities: "true",
      status: "Hello Ladies + Gentlemen, a signed OAuth request!",
      oauth_consumer_key: "xvz1evFS4wEEPTGEFPHBog",
      oauth_nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: "1318622958",
      oauth_token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
      oauth_version: "1.0",
    };

    const base = signatureBase(
      "POST",
      "https://api.twitter.com/1.1/statuses/update.json",
      params,
    );

    // La base de firma publicada por X, carácter por carácter.
    expect(base).toBe(
      "POST&https%3A%2F%2Fapi.twitter.com%2F1.1%2Fstatuses%2Fupdate.json&" +
        "include_entities%3Dtrue%26oauth_consumer_key%3Dxvz1evFS4wEEPTGEFPHBog" +
        "%26oauth_nonce%3DkYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg" +
        "%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1318622958" +
        "%26oauth_token%3D370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb" +
        "%26oauth_version%3D1.0%26status%3DHello%2520Ladies%2520%252B%2520" +
        "Gentlemen%252C%2520a%2520signed%2520OAuth%2520request%2521",
    );

    const key = signingKey(
      "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
      "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
    );
    expect(hmacSha1(base, key)).toBe("hCtSmYh+iHYCEqBWrE7C7hYmtUk=");
  });

  it("codifica según RFC 3986 (%21 %2A %27 %28 %29 y ~ intacto)", () => {
    expect(percentEncode("Ladies + Gentlemen")).toBe("Ladies%20%2B%20Gentlemen");
    expect(percentEncode("!*'()")).toBe("%21%2A%27%28%29");
    expect(percentEncode("abcABC019-_.~")).toBe("abcABC019-_.~");
    expect(percentEncode("á")).toBe("%C3%A1");
  });
});

describe("largo del texto", () => {
  it("cuenta cada URL como 23 caracteres sin importar su tamaño", () => {
    const url = "https://example.com/un/enlace/largo/de/prueba";
    expect(weightedLength(url)).toBe(23);
    expect(weightedLength(`ver ${url}`)).toBe(4 + 23);
  });

  it("acepta 280 y rechaza 281", () => {
    setCredentials();
    const publisher = xPublisher();
    expect(() => publisher.validate("x".repeat(X_MAX_LENGTH))).not.toThrow();
    expect(() => publisher.validate("x".repeat(X_MAX_LENGTH + 1))).toThrow(
      "El texto supera los 280 caracteres.",
    );
  });
});

describe("xPublisher sin configuración", () => {
  it("validate devuelve X no configurado y no toca la red", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const publisher = xPublisher();
    expect(readXEnv()).toBeNull();
    expect(() => publisher.validate("hola")).toThrow("X no configurado");
    await expect(publisher.send(draft())).rejects.toThrow("X no configurado");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tampoco firma si falta una sola credencial", async () => {
    setCredentials();
    delete process.env.X_ACCESS_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(() => xPublisher().validate("hola")).toThrow("X no configurado");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("xPublisher con configuración", () => {
  it("firma solo parámetros oauth: el cuerpo JSON queda fuera", async () => {
    setCredentials();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { id: "1800000000000000001" } }), {
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await xPublisher().send(draft("Hola con https://example.com"));
    expect(result).toEqual({ externalId: "1800000000000000001" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(X_TWEET_URL);
    expect(init.redirect).toBe("error");
    expect(init.body).toBe(
      JSON.stringify({ text: "Hola con https://example.com" }),
    );

    const header = String((init.headers as Record<string, string>).Authorization);
    const fields = parseOAuthHeader(header);
    const { oauth_signature: signature, ...rest } = fields;
    expect(Object.keys(fields).sort()).toEqual([
      "oauth_consumer_key",
      "oauth_nonce",
      "oauth_signature",
      "oauth_signature_method",
      "oauth_timestamp",
      "oauth_token",
      "oauth_version",
    ]);
    expect(rest.oauth_signature_method).toBe("HMAC-SHA1");
    expect(rest.oauth_version).toBe("1.0");
    expect(rest.oauth_consumer_key).toBe(CREDENTIALS.X_API_KEY);
    expect(rest.oauth_token).toBe(CREDENTIALS.X_ACCESS_TOKEN);
    // La firma se recalcula solo con parámetros oauth: si el cuerpo hubiera
    // entrado en la base, este valor no coincidiría.
    const expected = hmacSha1(
      signatureBase("POST", X_TWEET_URL, rest),
      signingKey(CREDENTIALS.X_API_SECRET, CREDENTIALS.X_ACCESS_SECRET),
    );
    expect(signature).toBe(expected);
    // El cuerpo no viaja en la cabecera.
    for (const value of Object.values(fields)) {
      expect(value).not.toContain("https://example.com");
    }
  });

  it("usa nonce y timestamp distintos en cada envío", () => {
    setCredentials();
    const creds = readXEnv();
    if (!creds) throw new Error("faltan credenciales de prueba");
    const first = oauthHeader({ method: "POST", url: X_TWEET_URL, credentials: creds });
    const second = oauthHeader({ method: "POST", url: X_TWEET_URL, credentials: creds });
    expect(first).not.toBe(second);
  });

  it("un estado distinto de 2xx es error sin filtrar la cabecera", async () => {
    setCredentials();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(xPublisher().send(draft())).rejects.toThrow(
      "X respondió con estado 403.",
    );
  });

  it("exige el id en la respuesta", async () => {
    setCredentials();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 201 })));
    await expect(xPublisher().send(draft())).rejects.toThrow(
      "X no devolvió el id del post.",
    );
  });
});

describe("sin fugas de secretos", () => {
  it("ninguna salida de log contiene claves, tokens ni Authorization", async () => {
    setCredentials();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { id: "77" } }), { status: 201 })),
    );
    const spies = ["log", "info", "warn", "error", "debug"] as const;
    const calls: unknown[][] = spies.map((level) => {
      const spy = vi.spyOn(console, level).mockImplementation(() => {});
      return spy.mock.calls as unknown[][];
    });

    // Camino feliz y camino de error.
    await xPublisher().send(draft("texto público"));
    await xPublisher().send(draft("x".repeat(300))).catch(() => {});

    const printed = calls.flat().flat().map((value) => String(value)).join("\n");
    const secrets = [
      ...Object.values(CREDENTIALS),
      "OAuth ",
      "Bearer ",
    ];
    for (const secret of secrets) {
      expect(printed).not.toContain(secret);
    }
  });
});
