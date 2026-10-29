import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isUnknownPortfolioSlug, portfolioSlugFromPath } from "@/lib/portfolio-slug-gate";

export async function proxy(request: NextRequest) {
  // d65: slug inexistente -> 404 real antes de que empiece el streaming.
  const slug = portfolioSlugFromPath(request.nextUrl.pathname);
  if (slug && (await isUnknownPortfolioSlug(slug))) {
    const url = request.nextUrl.clone();
    url.pathname = "/_portafolio-no-existe";
    url.search = "";
    return NextResponse.rewrite(url, { status: 404 });
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
