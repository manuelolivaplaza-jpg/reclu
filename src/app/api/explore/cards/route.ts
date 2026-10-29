import { exploreCardsPage, listExplorePortfolios, MORE_CARDS } from "@/lib/explore-cards";

/**
 * GET /api/explore/cards?offset=12&categoria=&q=&simbolo= (d62, P2)
 * Página siguiente de la grilla de Explorar con el payload mínimo.
 * Solo datos públicos de tarjeta (sin posiciones): el muro de pago no cambia.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const offset = Math.max(0, Math.min(10_000, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0));
  const category = (url.searchParams.get("categoria") ?? "all").slice(0, 40);
  const search = (url.searchParams.get("q") ?? "").slice(0, 100);
  const symbol = (url.searchParams.get("simbolo") ?? "").trim().toUpperCase().slice(0, 15);
  const all = await listExplorePortfolios({ category, search, symbol });
  const page = await exploreCardsPage(all, offset, MORE_CARDS);
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}