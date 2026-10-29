import { ogCard, OG_SIZE } from "@/lib/og-card";

export const alt = "Todos los portafolios que sigue reclu.cl";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return ogCard({ kicker: "Portafolios", title: "Todos los portafolios que sigue reclu.cl", subtitle: "Políticos de EE.UU., corredoras chilenas y fondos" });
}
