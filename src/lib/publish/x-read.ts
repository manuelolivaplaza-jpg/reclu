/**
 * Lecturas de X con Bearer token (app-only).
 *
 * El Bearer solo alcanza para endpoints públicos como `GET /2/tweets/:id`.
 * Para publicar hace falta OAuth 1.0a de usuario (`x.ts`).
 *
 * Documentación oficial:
 * - https://docs.x.com/x-api/posts/get-post-by-id
 *
 * `public_metrics` funciona con app-only. `non_public_metrics` y
 * `organic_metrics` exigen contexto de usuario y quedan fuera a propósito.
 * El Bearer se lee dentro de la llamada, nunca al importar el módulo.
 */

export const X_POST_URL = "https://api.x.com/2/tweets";

const ID_PATTERN = /^\d{1,20}$/;

export interface PostMetrics {
  id: string;
  metrics: Record<string, number>;
}

interface XPostResponse {
  data?: {
    id?: unknown;
    public_metrics?: Record<string, unknown>;
  };
}

/**
 * Métricas públicas de un post. Lanza "X no configurado" si falta el Bearer
 * y "Id de post inválido." si el id no es numérico. No loguea el token.
 */
export async function getPostMetrics(id: string): Promise<PostMetrics> {
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) throw new Error("X no configurado");
  if (!ID_PATTERN.test(id)) throw new Error("Id de post inválido.");

  const url = `${X_POST_URL}/${id}?tweet.fields=public_metrics`;
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    headers: { Authorization: `Bearer ${bearer}` },
  });

  if (!response.ok) {
    // Sin Authorization ni cuerpo crudo: puede repetir datos de la cuenta.
    throw new Error(`X respondió con estado ${response.status}.`);
  }

  const payload = (await response.json()) as XPostResponse;
  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(payload?.data?.public_metrics ?? {})) {
    if (typeof value === "number") metrics[key] = value;
  }

  return { id, metrics };
}
