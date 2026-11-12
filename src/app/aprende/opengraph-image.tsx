import { ogCard, OG_SIZE } from "@/lib/og-card";

export const alt = "13F, PTR, Form 4 y más, explicados simple";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return ogCard({ kicker: "Aprende", title: "13F, PTR, Form 4 y más, explicados simple" });
}
