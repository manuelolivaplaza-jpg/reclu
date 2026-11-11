import { ogCard, OG_SIZE } from "@/lib/og-card";

export const alt = "Cómo calculamos cada número";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return ogCard({ kicker: "Metodología", title: "Cómo calculamos cada número" });
}
