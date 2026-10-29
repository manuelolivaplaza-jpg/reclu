import { ogCard, OG_SIZE } from "@/lib/og-card";

export const alt = "Trump dice: cada mención y su retorno";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return ogCard({ kicker: "Trump dice", title: "Trump dice: cada mención y su retorno", subtitle: "Acciones que mencionó Donald Trump" });
}
