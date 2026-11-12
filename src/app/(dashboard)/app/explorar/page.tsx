import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ExploreView, type ExploreSearchParams } from "@/components/explore/explore-view";
import { getFollows, getProfile } from "@/lib/queries";
import { FREE_PLAN_FOLLOW_LIMIT, PRO_PLAN_FOLLOW_LIMIT } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";

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
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Explorar"
        subtitle={
          <>
            Políticos de EE.UU., corredoras chilenas y fondos. Sigues{" "}
            <span className="num font-medium text-ink-900">{followed}</span>{" "}
            {limit === null ? (
              <>portafolios en tu plan {planLabel}, sin límite.</>
            ) : (
              <>
                de <span className="num">{limit}</span> portafolios en tu plan {planLabel}.
              </>
            )}
          </>
        }
        className="mb-6 border-b border-app-border pb-5 lg:mb-8"
        actions={
          <nav aria-label="Accesos del panel" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href="/app/seguimiento"
              className="group inline-flex min-h-9 items-center gap-1.5 text-[13px] font-medium text-ink-900 transition-colors hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
            >
              Mis seguidos
              <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            </Link>
            <Link
              href="/compare"
              className="group inline-flex min-h-9 items-center gap-1.5 text-[13px] text-ink-500 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
            >
              Comparar cartera
              <ArrowRight aria-hidden="true" className="size-3" strokeWidth={1.75} />
            </Link>
          </nav>
        }
      />

      <ExploreView params={params} inApp />
    </div>
  );
}