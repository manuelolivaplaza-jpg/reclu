import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isUnknownPortfolioSlug, portfolioSlugFromPath } from "@/lib/portfolio-slug-gate";
import { accionSymbolFromPath, isUnknownAccionSymbol } from "@/lib/accion-gate";
import { isUnknownPartnerPath, partnerPathFromPath } from "@/lib/partner-path-gate";

/**
 * Ruta interna que no existe: reescribir ahí con `{ status: 404 }` hace que
 * Next sirva la página 404 con estado HTTP real, sin tocar la URL del usuario.
 */
const NOT_FOUND_PATH = "/_no-existe";

function notFoundRewrite(request: NextRequest, pathname = NOT_FOUND_PATH) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.rewrite(url, { status: 404 });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // d65: slug inexistente -> 404 real antes de que empiece el streaming.
  const slug = portfolioSlugFromPath(pathname);
  if (slug && (await isUnknownPortfolioSlug(slug))) {
    return notFoundRewrite(request, "/_portafolio-no-existe");
  }

  // B1/T3: ticker inexistente -> 404 real (un ticker real nunca da 404,
  // aunque el rol actual vea 0 carteras).
  const symbol = accionSymbolFromPath(pathname);
  if (symbol && (await isUnknownAccionSymbol(symbol))) {
    return notFoundRewrite(request);
  }

  // B1/T3: /p/<socio>/<tipo> inexistente -> 404 real (la página llama
  // notFound() después de `await connection()` y llegaba con estado 200).
  const partnerPath = partnerPathFromPath(pathname);
  if (
    partnerPath &&
    (await isUnknownPartnerPath(partnerPath.socio, partnerPath.tipo))
  ) {
    return notFoundRewrite(request);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets (svg, png, jpg, webp, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
