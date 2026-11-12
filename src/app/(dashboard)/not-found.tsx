import { EmptyState } from "@/components/app/empty-state";

export default function DashboardNotFound() {
  return (
    <EmptyState
      title="No encontramos esta página"
      description="Puede que la página ya no exista o que el enlace esté mal escrito."
      ctaHref="/app/explorar"
      ctaLabel="Explorar portafolios"
    />
  );
}