/**
 * portfolio-vision.ts — cliente de OpenRouter para la lectura de capturas de
 * corredora (F79). Solo servidor.
 *
 * Reglas:
 * - El modelo viene de `OPENROUTER_VISION_MODEL`, SIN valor por defecto: si
 *   falta, la ruta responde 503 con un mensaje claro. Nunca se hardcodea un
 *   modelo.
 * - Reusa `OPENROUTER_API_KEY` (misma clave que el chat).
 * - El pedido incluye `provider: { data_collection: "deny" }` para excluir a
 *   los proveedores que guardan o entrenan con los datos (informe legal §A5).
 * - No se registran prompts, claves ni el contenido de la imagen.
 */
import { buildVisionRequest, type ImageMime } from "@/lib/portfolio-image-import";

const OPENROUTER_VISION_URL = "https://openrouter.ai/api/v1/chat/completions";

/** La imagen es más lenta que el chat: 45 s. */
const VISION_TIMEOUT_MS = 45_000;

/** Variables de entorno que habilitan la lectura de capturas. */
export type VisionEnvVar = "OPENROUTER_API_KEY" | "OPENROUTER_VISION_MODEL";

export type VisionConfig =
  | { enabled: true; apiKey: string; model: string }
  | { enabled: false; missing: VisionEnvVar[] };

/**
 * Configuración de la visión. Se lee en cada llamada para que los cambios
 * de entorno en caliente y las pruebas funcionen.
 *
 * Sin modelo NO hay valor por defecto a propósito: el modelo de visión lo
 * elige quien opera el servicio.
 */
export function visionConfig(): VisionConfig {
  const apiKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  const model = (process.env.OPENROUTER_VISION_MODEL ?? "").trim();

  const missing: VisionEnvVar[] = [];
  if (!apiKey) missing.push("OPENROUTER_API_KEY");
  if (!model) missing.push("OPENROUTER_VISION_MODEL");

  if (missing.length > 0) return { enabled: false, missing };
  return { enabled: true, apiKey, model };
}

/** Mensaje 503 en español, sin exponer valores del entorno. */
export function visionUnavailableMessage(missing: readonly VisionEnvVar[]): string {
  return `La lectura de capturas no está disponible en este entorno: falta configurar ${missing.join(" y ")}.`;
}

/** Respuesta 503 lista para las rutas. */
export function visionUnavailableResponse(missing: readonly VisionEnvVar[]): Response {
  return Response.json(
    { error: visionUnavailableMessage(missing) },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Los modelos `:free` de OpenRouter pueden retener o entrenar con los datos.
 * El informe legal (§A5) pide excluirlos, así que se rechazan con un 503
 * claro en vez de mandar la imagen a un proveedor sin garantía.
 */
export function isFreeTierModel(model: string): boolean {
  return /:free\b/i.test(model.trim());
}

export type VisionResult =
  | { ok: true; content: string }
  | { ok: false; status: number; error: string };

function completionContent(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first: unknown = choices[0];
  if (!first || typeof first !== "object") return "";
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

/**
 * Manda la imagen (en base64) al modelo de visión y devuelve el texto crudo.
 *
 * La imagen viaja solo en el cuerpo de la petición: no se escribe en disco,
 * no se sube a Storage y no se registra en logs. Si algo falla, el mensaje
 * que vuelve al usuario es genérico: nunca se reenvía el error del proveedor.
 */
export async function callVisionModel(input: {
  apiKey: string;
  model: string;
  base64: string;
  mime: ImageMime;
}): Promise<VisionResult> {
  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER_VISION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildVisionRequest({
          model: input.model,
          base64: input.base64,
          mime: input.mime,
        }),
      ),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 502, error: "No se pudo contactar a OpenRouter." };
  }

  if (!upstream.ok) {
    // Solo el status: el cuerpo del proveedor puede traer detalle interno.
    console.warn("[reclu] vision OpenRouter:", upstream.status);
    return {
      ok: false,
      status: 502,
      error: "OpenRouter no devolvió una respuesta válida.",
    };
  }

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return {
      ok: false,
      status: 502,
      error: "OpenRouter no devolvió una respuesta válida.",
    };
  }

  const content = completionContent(data);
  if (!content.trim()) {
    return { ok: false, status: 502, error: "La IA no devolvió ninguna lectura." };
  }
  return { ok: true, content };
}
