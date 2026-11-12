import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ExploreView, type ExploreSearchParams } from "@/components/explore/explore-view";
import { getFollows, getProfile } from "@/lib/queries";
import { FREE_PLAN_FOLLOW_LIMIT, PRO_PLAN_FOLLOW_LIMIT } from "@/lib/types";

export const metadata = { title: "Explorar", robots: { index: false } };
export const instant = false;

export default async function AppExplorePage({ searchParams }: { searchParams: Promise<ExploreSearchParams> }) {
  await connection();
  const [follows, profile, params] = await Promise.all([getFollows(), getProfile(), searchParams]);

  const plan = profile?.plan ?? "free";
  const planLabel = plan === "elite" ? "Elite" : plan === "pro" ? "Pro" : "Gratis";
  const limit = plan === "elite" ? null : plan === "pro" ? PRO_PLAN_FOLLOW_LIMIT : FREE_PLAN_FOLLOW_LIMIT;
  const followed = follows.length;

  return (
    <div>
      <h1 className="sr-only">Explorar portafolios</h1>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-ink-200 pb-4">
        <p className="text-[13px] text-ink-500">
          Sigues <span className="font-medium tabular-nums text-ink-900">{followed}</span>{" "}
          {limit === null ? (
            <>portafolios en tu plan {planLabel} · sin límite</>
          ) : (
            <>
              de <span className="tabular-nums">{limit}</span> portafolios en tu plan {planLabel}
            </>
          )}
        </p>

        <nav aria-label="Accesos del panel" className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link
            href="/app/seguimiento"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-900 hover:underline hover:underline-offset-4"
          >
            Mis seguidos
            <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          </Link>
          <Link
            href="/compare"
            className="inline-flex items-center gap-1 text-[12px] text-ink-500 transition-colors hover:text-ink-900"
          >
            Comparar cartera
            <ArrowRight aria-hidden="true" className="size-3" strokeWidth={1.75} />
          </Link>
        </nav>
      </div>

      <ExploreView params={params} inApp />
    </div>
  );
}