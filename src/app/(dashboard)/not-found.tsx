import { EmptyState } from "@/components/app/empty-state";

export default function DashboardNotFound() {
  return (
    <EmptyState
      title="No encontramos esta página"
      description="Puede que el portafolio ya no exista o que el enlace esté mal."
      ctaHref="/app/explorar"
      ctaLabel="Ir a Explorar"
    />
  );
}