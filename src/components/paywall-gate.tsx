import Link from "next/link";
import { cn } from "@/lib/utils";

/** Anchos distintos: sugieren filas de datos sin revelar nada. */
const GHOST_ABOVE = [
  ["w-[58%]", "w-[14%]"],
  ["w-[36%]", "w-[20%]"],
  ["w-[72%]", "w-[11%]"],
] as const;

const GHOST_BELOW = [
  ["w-[47%]", "w-[16%]"],
  ["w-[64%]", "w-[12%]"],
  ["w-[31%]", "w-[18%]"],
] as const;

/**
 * PaywallGate — censura holdings, gráficas y retorno para quien no tiene cuenta.
 * Con `locked`, no monta el children: muestra filas fantasma y el CTA.
 * Sin `locked`, muestra el children tal cual.
 */
export function PaywallGate({
  locked,
  children,
  label = "contenido",
  className,
}: {
  locked: boolean;
  children: React.ReactNode;
  /** Qué se está censurando, para el copy del muro. */
  label?: string;
  className?: string;
}) {
  if (!locked) {
    return <>{children}</>;
  }

  return (
    <div
      className={cn("border border-ink-200 bg-white", className)}
      role="region"
      aria-label={`Contenido reservado: ${label}`}
    >
      <GhostRows rows={GHOST_ABOVE} />

      <div className="flex flex-col items-center px-6 py-10 text-center sm:px-10">
        <p className="max-w-[14ch] text-[clamp(28px,3vw,32px)] font-medium leading-[1.05] tracking-[-0.03em] text-ink-900">
          Crea tu cuenta.
        </p>
        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink-500">
          Para ver {label}. Accede a las acciones, las gráficas y las alertas de este
          portafolio. Gratis en 2 portafolios.
        </p>
        <div className="mt-6 flex items-center gap-5">
          <Link
            href="/signup"
            className="inline-flex h-12 items-center rounded-full bg-ink-900 px-[22px] text-[15px] font-medium text-white hover:bg-black"
          >
            Crear cuenta
          </Link>
          <Link
            href="/login"
            className="text-[15px] text-ink-900 underline-offset-4 hover:underline"
          >
            Entrar
          </Link>
        </div>
      </div>

      <GhostRows rows={GHOST_BELOW} />
    </div>
  );
}

function GhostRows({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <div aria-hidden="true" className="px-5 sm:px-6">
      {rows.map(([left, right]) => (
        <div
          key={left + right}
          className="flex h-9 items-center justify-between gap-8 border-b border-ink-200 last:border-b-0"
        >
          <span className={cn("h-2.5 bg-ink-200", left)} />
          <span className={cn("h-2.5 shrink-0 bg-ink-100", right)} />
        </div>
      ))}
    </div>
  );
}

/**
 * Fila censurada: para listas de holdings donde solo queremos difuminar,
 * sin el recuadro completo del muro. Útil dentro de tablas.
 */
export function CensoredBlur({ locked, children }: { locked: boolean; children: React.ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <span className="pointer-events-none select-none blur-[5px]" aria-hidden="true">
      {children}
    </span>
  );
}
