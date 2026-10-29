import { LogoLockup } from "@/components/logo";

/** Logo compacto para la topbar móvil (usa el logo oficial de Reclu). */
export function LogoMark() {
  return (
    <span className="block origin-left scale-90">
      <LogoLockup />
    </span>
  );
}