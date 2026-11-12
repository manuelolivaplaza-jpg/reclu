import { AlertsSkeleton } from "./alerts-skeleton";

export default function Loading() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div aria-hidden="true" className="border-b border-app-border pb-5">
        <div className="h-3 w-40 animate-pulse bg-line" />
        <div className="mt-3 h-7 w-32 animate-pulse bg-line sm:h-8 sm:w-36" />
        <div className="mt-3 h-4 w-full max-w-xl animate-pulse bg-line" />
        <div className="mt-2 h-4 w-2/3 max-w-sm animate-pulse bg-line" />
      </div>
      <AlertsSkeleton />
    </div>
  );
}
