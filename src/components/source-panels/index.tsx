import type { ComponentType } from "react";
import { CorredorasClPanel } from "@/components/source-panels/corredoras-cl";

export type SourcePanelProps = {
  portfolioId: string;
  slug: string;
};

export const SOURCE_PANELS: Record<string, ComponentType<SourcePanelProps>> = {
  corredoras_cl: CorredorasClPanel,
  bice_cartera: CorredorasClPanel,
  mbi_cartera: CorredorasClPanel,
};

export function SourcePanel({
  source,
  portfolioId,
  slug,
}: SourcePanelProps & { source: string }) {
  const Panel = SOURCE_PANELS[source];
  if (!Panel) return null;
  return <Panel portfolioId={portfolioId} slug={slug} />;
}
