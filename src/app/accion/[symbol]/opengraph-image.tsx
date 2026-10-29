import { ogCard, OG_SIZE } from "@/lib/og-card";

export const alt = "¿Quién tiene esta acción? fraccion.si";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const s = symbol.toUpperCase().slice(0, 12);
  return ogCard({ kicker: "Acción", title: `¿Quién tiene ${s}?`, subtitle: "Políticos, corredoras y fondos que la compran" });
}