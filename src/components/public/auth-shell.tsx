import Link from "next/link";
import { Bell, LineChart, ShieldCheck } from "lucide-react";
import { LogoLockup } from "@/components/logo";

/**
 * Fuentes reales que alimentan el producto. El panel de acceso no muestra
 * cifras ni carteras inventadas: solo nombra de dónde sale la información.
 */
const FUENTES = [
  { nombre: "House Disclosure", detalle: "Divulgaciones periódicas de la Cámara de Representantes de EE.UU." },
  { nombre: "SEC 13F", detalle: "Reportes trimestrales de fondos institucionales." },
  { nombre: "Renta 4 · BTG Pactual", detalle: "Carteras recomendadas publicadas por corredoras chilenas." },
] as const;

const PERKS = [
  { icon: "chart", title: "Carteras de corredoras gratis", text: "Renta 4, BTG y más, con todas sus posiciones." },
  { icon: "bell", title: "Alertas cuando cambian", text: "Compras y ventas apenas se publican." },
  { icon: "shield", title: "Solo información pública", text: "Nunca pedimos acceso a tu corredora." },
] as const;

function PerkIcon({ name }: { name: (typeof PERKS)[number]["icon"] }) {
  if (name === "bell") return <Bell className="size-4" aria-hidden />;
  if (name === "shield") return <ShieldCheck className="size-4" aria-hidden />;
  return <LineChart className="size-4" aria-hidden />;
}

/**
 * Marco de login y registro: formulario a la izquierda y, en escritorio, un
 * panel oscuro con las fuentes públicas del catálogo. En celular el panel se
 * oculta para que el formulario quede arriba del pliegue.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pub-canvas flex min-h-[100dvh] flex-col">
      <div className="mx-auto grid w-full max-w-[1360px] flex-1 gap-6 px-4 py-5 md:px-8 md:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
        <main className="flex flex-col">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" aria-label="Ir al inicio">
              <LogoLockup />
            </Link>
            <span className="pub-chip pub-chip-positive">
              <span className="pub-dot" aria-hidden />
              Datos públicos verificados
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center py-8 md:py-12">{children}</div>
          <p className="text-center text-xs leading-relaxed text-ink-500">
            Información pública, no es asesoría de inversión.
          </p>
        </main>

        <aside className="pub-card-dark relative hidden overflow-hidden p-8 lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-[13px] text-white/60">Lo que movieron los grandes</p>
            <p className="mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-0.035em]">
              Sigue las carteras que mueven el mercado.
            </p>
          </div>

          <div className="mt-8">
            <p className="text-[11px] tracking-[0.02em] text-white/50">Fuentes</p>
            <ul className="mt-3 border-t border-white/15">
              {FUENTES.map((fuente) => (
                <li key={fuente.nombre} className="border-b border-white/15 py-3">
                  <p className="text-[14px] font-medium">{fuente.nombre}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-white/55">{fuente.detalle}</p>
                </li>
              ))}
            </ul>
          </div>

          <ul className="mt-8 flex flex-col gap-4">
            {PERKS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-none border border-white/15 text-white">
                  <PerkIcon name={p.icon} />
                </span>
                <div>
                  <p className="text-[14px] font-medium">{p.title}</p>
                  <p className="text-[13px] text-white/55">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
