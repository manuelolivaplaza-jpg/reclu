import type { ComponentType } from "react";

export type SourcePanelProps = {
  portfolioId: string;
  slug: string;
};

// TODO(F13/F15): registrar panel
export const SOURCE_PANELS: Record<string, ComponentType<SourcePanelProps>> = {};

export function SourcePanel({
  source,
  portfolioId,
  slug,
}: SourcePanelProps & { source: string }) {
  const Panel = SOURCE_PANELS[source];
  if (!Panel) return null;
  return <Panel portfolioId={portfolioId} slug={slug} />;
}
