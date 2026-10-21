import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La plantilla `.env.example` es documentación ejecutable: si falta una
 * variable, quien copia el archivo a `.env.local` se queda sin la función.
 * Este test no lee `.env` ni `.env.local` (pueden tener secretos reales).
 */
const EXAMPLE_PATH = path.resolve(__dirname, "../.env.example");

const REQUIRED_KEYS = [
  "X_API_KEY",
  "X_API_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_SECRET",
  "X_BEARER_TOKEN",
  "PUBLISH_MODE",
  "PUBLISH_X_ENABLED",
  "PUBLISH_TELEGRAM_ENABLED",
  "PUBLISH_NEWSLETTER_ENABLED",
  "TELEGRAM_CHANNEL_ID",
  "NEWSLETTER_FROM",
  "ADMIN_EMAILS",
  "COMMUNITY_ENABLED",
  "REFERRALS_ENABLED",
  "SPONSORS_ENABLED",
  "API_PUBLIC_ENABLED",
  "PORTFOLIO_IMAGE_IMPORT_ENABLED",
] as const;

const DISABLED_FLAGS = [
  "PUBLISH_X_ENABLED",
  "PUBLISH_TELEGRAM_ENABLED",
  "PUBLISH_NEWSLETTER_ENABLED",
  "COMMUNITY_ENABLED",
  "REFERRALS_ENABLED",
  "SPONSORS_ENABLED",
  "API_PUBLIC_ENABLED",
  "PORTFOLIO_IMAGE_IMPORT_ENABLED",
] as const;

/** Clave = valor de las líneas `KEY=valor`, sin comentarios ni comillas. */
function parseExample(raw: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rest] = match;
    let value = rest.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }

  return values;
}

const EXAMPLE = parseExample(readFileSync(EXAMPLE_PATH, "utf8"));

describe(".env.example", () => {
  it("incluye todas las variables de publicación, canales y flags", () => {
    for (const key of REQUIRED_KEYS) {
      expect(EXAMPLE.has(key), `falta ${key} en .env.example`).toBe(true);
    }
  });

  it("deja los canales y las funciones nuevas apagados por defecto", () => {
    for (const key of DISABLED_FLAGS) {
      expect(EXAMPLE.get(key), `${key} debe valer false`).toBe("false");
    }
  });

  it("arranca la publicación en modo preview", () => {
    expect(EXAMPLE.get("PUBLISH_MODE")).toBe("preview");
  });

  it("no trae secretos: las credenciales de X quedan vacías", () => {
    for (const key of [
      "X_API_KEY",
      "X_API_SECRET",
      "X_ACCESS_TOKEN",
      "X_ACCESS_SECRET",
      "X_BEARER_TOKEN",
    ]) {
      expect(EXAMPLE.get(key), `${key} debe quedar vacía`).toBe("");
    }
  });
});
