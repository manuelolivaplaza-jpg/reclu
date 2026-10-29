import { AppLink as Link } from "@/components/app/app-link";
import { BellRing } from "lucide-react";
import type { Alert, AlertType } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

type A = Alert & { portfolio: NonNullable<Alert["portfolio"]> };

const CHIP: Partial<Record<AlertType, { label: string; cls: string }>> = {
  new_trade: { label: "Compra", cls: "bg-positive/10 text-positive" },
  sold_trade: { label: "Venta", cls: "bg-negative/10 text-negative" },
  weight_change: { label: "Peso", cls: "bg-ink-100 text-ink-700" },
  mention: { label: "Mención", cls: "bg-ink-100 text-ink-700" },
  threshold: { label: "Umbral", cls: "bg-ink-100 text-ink-700" },
  dividend: { label: "Dividendo", cls: "bg-ink-100 text-ink-700" },
  earnings: { label: "Resultados", cls: "bg-ink-100 text-ink-700" },
  "13f_update": { label: "13F", cls: "bg-ink-100 text-ink-700" },
};

/** Últimas 5 alertas con chip de tipo y fecha relativa. */
export function AlertsPreview({ alerts }: { alerts: A[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-app border border-app-border bg-white px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-ink-100">
          <BellRing className="size-5 text-ink-500" strokeWidth={1.75} />
        </span>
        <p className="mt-3 text-[15px] font-medium text-ink-900">Sin alertas todavía</p>
        <p className="mt-1 text-[13px] text-ink-500">Sigue portafolios y te avisaremos cuando cambien.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-app-border overflow-hidden rounded-app border border-app-border bg-white">
      {alerts.slice(0, 5).map((a) => {
        const chip = CHIP[a.type];
        return (
          <li key={a.id}>
            <Link href={`/portfolio/${a.portfolio.slug}`} className="block px-4 py-3.5 hover:bg-ink-50 sm:px-5">
              <div className="flex items-center gap-2 text-[12px] text-ink-500">
                {chip && (
                  <span className={cn("rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold", chip.cls)}>
                    {chip.label}
                  </span>
                )}
                <span className="truncate font-medium text-ink-700">{a.portfolio.name}</span>
                <span className="ml-auto shrink-0 tabular-nums">{timeAgo(a.created_at)}</span>
              </div>
              <p className="mt-1.5 line-clamp-1 text-[15px] font-medium text-ink-900">{a.title}</p>
              {a.summary && <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-ink-500">{a.summary}</p>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
