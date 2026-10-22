/**
 * POST /api/holdings/image — lee una captura de la corredora con un modelo
 * de visión de OpenRouter (F79) y devuelve las posiciones detectadas.
 *
 * Body: multipart/form-data con el campo "file".
 *
 * Flujo:
 *   1. Solo con `PORTFOLIO_IMAGE_IMPORT_ENABLED=true` (si no, 404).
 *   2. Exige sesión (401) y consentimiento vigente de la cartera (403).
 *   3. Valida la imagen por MAGIC BYTES (solo PNG, JPEG, WebP) y tamaño
 *      máximo de 4 MB (400 / 413). El `Content-Type` del navegador no decide.
 *   4. La imagen NO se guarda en ningún lado: ni Storage, ni disco, ni logs.
 *      Solo viaja en base64 dentro del pedido al modelo y se descarta.
 *   5. Descuenta 1 del cupo de IA (`enforceSignedInQuota`) por imagen
 *      procesada.
 *   6. Valida la respuesta del modelo con un esquema cerrado (zod) y descarta
 *      lo que no cumpla. No se reenvía texto libre del modelo al usuario ni
 *      mensajes internos del proveedor.
 *
 * La respuesta es una propuesta, no un guardado: el usuario revisa y edita las
 * posiciones antes de usar la acción normal de guardar.
 */

import { enforceSignedInQuota } from "@/lib/chat-guard";
import {
  parseImageDetection,
  validateImageUpload,
  type DetectedPosition,
  type ImageMime,
} from "@/lib/portfolio-image-import";
import { hasCurrentPortfolioConsent } from "@/lib/portfolio-consent";
import { isPortfolioImageImportEnabled } from "@/lib/portfolio-flags";
import {
  callVisionModel,
  visionConfig,
  visionUnavailableResponse,
} from "@/lib/portfolio-vision";
import { createClient } from "@/lib/supabase/server";

/** Holgura sobre el tope de la imagen para el envoltorio multipart. */
const MAX_REQUEST_BYTES = 4 * 1024 * 1024 + 64 * 1024;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Saca el archivo del multipart. Devuelve null si no hay archivo legible.
 * No se registra ni se persiste su contenido.
 */
async function readUploadedFile(request: Request): Promise<File | null> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return null;
  }
  const value = form.get("file");
  if (!value || typeof value === "string") return null;
  // En Node, `File` es el objeto de multipart; cualquier otra cosa se ignora.
  const candidate = value as File;
  if (typeof candidate.arrayBuffer !== "function") return null;
  return candidate;
}

export async function POST(request: Request) {
  // 1. Función detrás de flag: apagada responde 404 (no revela que existe).
  if (!isPortfolioImageImportEnabled()) {
    return jsonError("No encontrada.", 404);
  }

  // TopeEarly: si el navegador ya envió un body enorme, se corta antes de
  // materializarlo en memoria.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return jsonError("La imagen supera 4 MB. Recorta la captura y vuelve a subirla.", 413);
  }

  // 2. Sesión obligatoria: es una lectura sobre la cartera propia.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("Inicia sesión para importar tu cartera.", 401);
  }

  // 2b. Consentimiento vigente (Ley 21.719): la versión debe ser la actual.
  const settingsResult = await supabase
    .from("user_portfolio_settings")
    .select("consent_at, consent_version")
    .eq("user_id", user.id)
    .maybeSingle();
  if (settingsResult.error) {
    // F80: solo el código del error. El mensaje crudo de Supabase puede
    // traer detalle interno de la base y no va a los logs.
    console.warn(
      "[reclu] image import consent:",
      settingsResult.error.code ?? "sin código",
    );
    return jsonError("No pudimos verificar tu consentimiento.", 503);
  }
  const settings = settingsResult.data as
    | { consent_at?: string | null; consent_version?: string | null }
    | null;
  const hasConsent = hasCurrentPortfolioConsent(
    settings?.consent_at ?? null,
    settings?.consent_version ?? null,
  );
  if (!hasConsent) {
    return jsonError(
      "Necesitamos tu consentimiento explícito para tratar tu cartera. Actívalo en Ajustes.",
      403,
    );
  }

  // 3. Imagen: formato por magic bytes y tamaño máximo.
  const file = await readUploadedFile(request);
  if (!file) {
    return jsonError("No pudimos leer la imagen. Vuelve a intentarlo.", 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateImageUpload(bytes);
  if (!validation.ok) {
    return jsonError(validation.error, validation.status);
  }

  // 4. Modelo de visión: sin `OPENROUTER_VISION_MODEL` no hay IA (503).
  const config = visionConfig();
  if (!config.enabled) {
    return visionUnavailableResponse(config.missing);
  }
  // Decision de Manu: se admiten modelos de pago o `:free`. La privacidad la
  // garantiza `provider.data_collection = "deny"` en cada pedido
  // (OpenRouter excluye a los proveedores que guardan o entrenan con datos).

  // 5. Cupo de IA: una imagen procesada cuesta 1.
  const quota = await enforceSignedInQuota(user.id);
  if (!quota.ok) {
    return Response.json(quota.body, {
      status: quota.status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // 6. La imagen viaja en base64 al modelo y se descarta: no se guarda.
  const base64 = Buffer.from(bytes).toString("base64");
  const result = await callVisionModel({
    apiKey: config.apiKey,
    model: config.model,
    base64,
    mime: validation.mime as ImageMime,
  });
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  // 7. Solo pasa lo que cumple el esquema cerrado.
  const parsed = parseImageDetection(result.content);
  if (!parsed.ok) {
    if (parsed.reason === "injection") {
      return jsonError(
        "La captura contenía texto que no es de tu cartera. No leimos nada de ella.",
        422,
      );
    }
    return jsonError(
      "No pudimos leer las posiciones de la captura. Revisa que la imagen se vea bien.",
      422,
    );
  }

  const positions: DetectedPosition[] = parsed.positions;
  if (positions.length === 0) {
    return jsonError(
      "No encontramos posiciones en la captura. Revisa que la tabla de tu corredora se vea completa.",
      422,
    );
  }

  return Response.json(
    {
      positions,
      /** Campo que trae la información principal: cantidad, monto, peso o solo símbolo. */
      mode: parsed.mode,
      /** Filas que el modelo devolvió pero no pasaron la validación. */
      discarded: parsed.discarded,
    },
    {
      headers: {
        ...quota.headers,
        "Cache-Control": "no-store",
      },
    },
  );
}
