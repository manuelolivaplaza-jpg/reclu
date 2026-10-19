/**
 * Publicador de X (Twitter) con OAuth 1.0a de usuario.
 *
 * `POST /2/tweets` exige contexto de usuario: las credenciales de app
 * (X_API_KEY / X_API_SECRET) por sí solas no alcanzan, y el Bearer token
 * (app-only) no sirve para publicar. Se firman las cuatro credenciales
 * OAuth 1.0a con HMAC-SHA1.
 *
 * Documentación oficial:
 * - Endpoint: https://docs.x.com/x-api/posts/create-post
 * - Firma: https://docs.x.com/fundamentals/authentication/oauth-1-0a/creating-a-signature
 *
 * El cuerpo JSON `{ text }` NO entra en la base de firma: OAuth 1.0a solo
 * firma los parámetros del protocolo y de la query string. Tampoco se
 * incluyen `oauth_body_hash` ni se firma el payload.
 *
 * Las claves se leen dentro de cada llamada, nunca al importar el módulo.
 * No se loguean claves, tokens ni la cabecera Authorization.
 *
 * El flag `PUBLISH_X_ENABLED` se vuelve a revisar dentro de `send` para fallar
 * cerrado incluso si alguien invoca el adaptador sin pasar por `publishDraft`.
 */

import { createHmac, randomBytes } from "node:crypto";
import { isChannelEnabled } from "./flags";
import type { Draft, Publisher } from "./types";

/** URL exacta del endpoint de creación de posts. */
export const X_TWEET_URL = "https://api.x.com/2/tweets";

/** X acorta cualquier enlace a un t.co de 23 caracteres. */
export const X_URL_LENGTH = 23;
export const X_MAX_LENGTH = 280;

const URL_PATTERN = /https?:\/\/[^\s]+/gi;

const X_ENV_KEYS = [
  "X_API_KEY",
  "X_API_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_SECRET",
  "X_BEARER_TOKEN",
] as const;

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
  /** App-only. Solo sirve para lecturas (`x-read.ts`), nunca para firmar. */
  bearerToken: string;
}

/**
 * Lee las cinco variables de X desde `process.env` en el momento de llamar.
 * Devuelve `null` si falta alguna de las cuatro credenciales de publicación;
 * el Bearer ausente solo afecta a las lecturas.
 */
export function readXEnv(): XCredentials | null {
  const values = Object.fromEntries(
    X_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof X_ENV_KEYS)[number], string | undefined>;

  const apiKey = values.X_API_KEY;
  const apiSecret = values.X_API_SECRET;
  const accessToken = values.X_ACCESS_TOKEN;
  const accessSecret = values.X_ACCESS_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;

  return {
    apiKey,
    apiSecret,
    accessToken,
    accessSecret,
    bearerToken: values.X_BEARER_TOKEN ?? "",
  };
}

/** RFC 3986: `encodeURIComponent` y además se escapan !'()* */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Base de firma: METHOD&url_encode(base URL)&url_encode(params ordenados).
 * Los parámetros deben venir ya sin el cuerpo JSON.
 */
export function signatureBase(
  method: string,
  url: string,
  params: Readonly<Record<string, string>>,
): string {
  const encoded = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key] ?? "")}`)
    .join("&");

  return [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(encoded),
  ].join("&");
}

/** Clave de firma: secret de app & secret del token. */
export function signingKey(apiSecret: string, accessSecret: string): string {
  return `${percentEncode(apiSecret)}&${percentEncode(accessSecret)}`;
}

/** HMAC-SHA1 en base64, tal como lo espera OAuth 1.0a. */
export function hmacSha1(base: string, key: string): string {
  return createHmac("sha1", key).update(base).digest("base64");
}

export interface OAuthHeaderOptions {
  method: string;
  url: string;
  credentials: XCredentials;
  /** Solo para tests con vectores conocidos. */
  nonce?: string;
  /** Solo para tests con vectores conocidos. */
  timestamp?: number;
}

/**
 * Cabecera Authorization con las siete claves de OAuth 1.0a.
 * No recibe ni firma el cuerpo.
 */
export function oauthHeader({
  method,
  url,
  credentials,
  nonce,
  timestamp,
}: OAuthHeaderOptions): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: nonce ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(
      timestamp ?? Math.floor(Date.now() / 1000),
    ),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  const base = signatureBase(method, url, oauthParams);
  const signature = hmacSha1(
    base,
    signingKey(credentials.apiSecret, credentials.accessSecret),
  );

  const headerParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const fields = Object.keys(headerParams)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(headerParams[key] ?? "")}"`)
    .join(", ");

  return `OAuth ${fields}`;
}

/**
 * Largo que cuenta X: cada URL pesa 23 sin importar su tamaño.
 * Cuenta puntos de código, no unidades UTF-16 (un emoji no se parte).
 */
export function weightedLength(text: string): number {
  const withoutUrls = text.replace(URL_PATTERN, "x".repeat(X_URL_LENGTH));
  return Array.from(withoutUrls).length;
}

function requireCredentials(): XCredentials {
  const credentials = readXEnv();
  if (!credentials) throw new Error("X no configurado");
  return credentials;
}

function validateBody(body: string): void {
  requireCredentials();
  const text = body.trim();
  if (text.length === 0) throw new Error("El texto está vacío.");
  if (weightedLength(text) > X_MAX_LENGTH) {
    throw new Error("El texto supera los 280 caracteres.");
  }
}

interface XCreatePostResponse {
  data?: { id?: unknown };
  detail?: unknown;
  title?: unknown;
}

export function xPublisher(): Publisher {
  return {
    channel: "x",

    validate(body: string): void {
      validateBody(body);
    },

    async send(draft: Draft): Promise<{ externalId: string }> {
      if (!isChannelEnabled("x")) {
        throw new Error("El canal X está apagado.");
      }
      // Se releen las claves en cada envío: nunca se cachean en el módulo.
      const credentials = requireCredentials();
      validateBody(draft.body);

      const response = await fetch(X_TWEET_URL, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: oauthHeader({
            method: "POST",
            url: X_TWEET_URL,
            credentials,
          }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: draft.body }),
      });

      if (!response.ok) {
        // Nunca se incluye la cabecera Authorization ni el cuerpo del error
        // completo: puede repetir datos de la cuenta.
        throw new Error(`X respondió con estado ${response.status}.`);
      }

      const payload = (await response.json()) as XCreatePostResponse;
      const id = payload?.data?.id;
      if (typeof id !== "string" || id.length === 0) {
        throw new Error("X no devolvió el id del post.");
      }

      return { externalId: id };
    },
  };
}
