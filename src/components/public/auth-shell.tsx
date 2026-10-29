import Link from "next/link";
import { Bell, LineChart, ShieldCheck } from "lucide-react";
import { LogoLockup } from "@/components/logo";

/** Serie ilustrativa fija (no son datos reales): solo decora el panel. */
const SERIES = [12, 14, 13, 17, 16, 19, 18, 22, 21, 25, 24, 28, 27, 31, 30, 34, 36, 35, 39, 42];

function Sparkline() {
  const w = 320;
  const h = 110;
  const max = Math.max(...SERIES);
  const min = Math.min(...SERIES);
  const pts = SERIES.map((v, i) => {
    const x = (i / (SERIES.length - 1)) * w;
    const y = h - 8 - ((v - min) / (max - min)) * (h - 16);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" aria-hidden>
      <defs>
        <linearGradient id="auth-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 5" />
      ))}
      <path d={area} fill="url(#auth-area)" />
      <path d={line} fill="none" stroke="#22c55e" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="7" fill="#22c55e" opacity="0.25" />
      <circle cx={lx} cy={ly} r="3.5" fill="#22c55e" />
    </svg>
  );
}

const PERKS = [
  { icon: "chart", title: "Carteras de corredoras gratis", text: "Renta 4, BTG y más, con todas sus acciones." },
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
 * panel oscuro con gráfico ilustrativo. En celular el panel se reduce a una
 * franja compacta para que el formulario quede arriba del pliegue.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pub-canvas flex min-h-[100dvh] flex-col">
      <div className="mx-auto grid w-full max-w-[1120px] flex-1 gap-6 px-4 py-5 md:px-8 md:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
        <main className="flex flex-col">
          <div className="flex items-center justify-between">
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
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white text-[13px] font-semibold text-ink-900">
                  R4
                </span>
                <div>
                  <p className="text-[14px] font-medium">Cartera recomendada</p>
                  <p className="text-[12px] text-white/50">Ejemplo ilustrativo</p>
                </div>
              </div>
              <span className="pub-chip pub-chip-dark">1A</span>
            </div>
            <div className="mt-4">
              <Sparkline />
            </div>
            <div className="mt-3 flex gap-2">
              {["Compra", "Venta", "Sin cambios"].map((c) => (
                <span key={c} className="pub-chip pub-chip-dark">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <ul className="mt-8 flex flex-col gap-4">
            {PERKS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
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
