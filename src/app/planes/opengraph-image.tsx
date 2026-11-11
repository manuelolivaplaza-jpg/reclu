import { ogCard, OG_SIZE } from "@/lib/og-card";

export const alt = "Planes y precios de Fraccion";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return ogCard({ kicker: "Planes", title: "Planes y precios de Fraccion", subtitle: "Corredoras gratis · Pro $9.990 al mes" });
}
