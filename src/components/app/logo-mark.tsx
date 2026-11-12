import { LogoLockup } from "@/components/logo";

/**
 * Logo compacto para la topbar móvil. Es decorativo: el enlace que lo envuelve
 * lleva el nombre accesible ("Fraccion, ir al resumen").
 */
export function LogoMark() {
  return (
    <span aria-hidden className="block origin-left scale-90">
      <LogoLockup />
    </span>
  );
}
