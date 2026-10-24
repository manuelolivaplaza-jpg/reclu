import { revalidateTag } from "next/cache";
import { ALL_PUBLIC_TAGS } from "@/lib/cache-tags";
import { isRevalidateAuthorized } from "@/lib/revalidate-auth";

/**
 * POST /api/revalidate (D36)
 * Header: Authorization: Bearer <REVALIDATE_SECRET>
 * Invalida la caché de lecturas públicas (portafolios, series). Lo llama el
 * workflow de scrapers al terminar el pipeline. Sin REVALIDATE_SECRET
 * responde 503; con secreto incorrecto, 401. Nunca devuelve el secreto.
 */
export async function POST(request: Request) {
  if (!process.env.REVALIDATE_SECRET) {
    return Response.json({ ok: false, error: "Revalidación no configurada." }, { status: 503 });
  }
  if (!isRevalidateAuthorized(request.headers.get("authorization"))) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  for (const tag of ALL_PUBLIC_TAGS) revalidateTag(tag, "max");
  return Response.json({ ok: true, tags: ALL_PUBLIC_TAGS });
}
