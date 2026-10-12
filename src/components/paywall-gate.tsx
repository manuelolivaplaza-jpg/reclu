import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PaywallGate — censura el contenido de valor (holdings, gráficas, retorno
 * histórico) para visitantes sin cuenta. Con `locked`, muestra el contenido
 * real pero desenfocado/bloqueado tras un muro con CTA; sin `locked`, muestra
 * el children tal cual.
 *
 * El children se renderiza SIEMPRE (para que el blur tenga algo que difuminar),
 * pero se hace inaccesible visualmente cuando está bloqueado.
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
    <div className={cn("relative overflow-hidden", className)}>
      {/* Contenido real, desenfocado y sin interacción */}
      <div
        className="pointer-events-none select-none blur-[6px] saturate-50"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Velo que tapa el desenfoque y centra el CTA */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/60">
        <div className="mx-4 flex max-w-sm flex-col items-center border border-ink-900 bg-white px-6 py-8 text-center">
          <Lock className="size-5 text-ink-900" strokeWidth={1.5} />
          <p className="mt-4 text-[17px] font-medium tracking-[-0.02em] text-ink-900">
            Crea tu cuenta para ver el {label}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-500">
            Accede a las acciones, las gráficas y las alertas de este portafolio.
            Gratis en 2 portafolios.
          </p>
          <div className="mt-5 flex items-center gap-4">
            <Link
              href="/signup"
              className="inline-flex h-10 items-center rounded-full bg-ink-900 px-5 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
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
      </div>
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
