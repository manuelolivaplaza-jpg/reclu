import { ogCard, OG_SIZE } from "@/lib/og-card";

export const alt = "Ranking honesto contra el mercado";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return ogCard({ kicker: "Ranking", title: "Ranking honesto contra el mercado", subtitle: "Cada fuente contra el S&P 500 o el IPSA" });
}
