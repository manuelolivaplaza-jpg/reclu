import { AlertsSkeleton } from "./alerts-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-8 w-40 animate-pulse rounded-[8px] bg-ink-100" />
      <AlertsSkeleton />
    </div>
  );
}
