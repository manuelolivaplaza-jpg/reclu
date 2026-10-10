import { cn } from "@/lib/utils";

/**
 * reclu logo — an abstract "radar sweep" mark: a chart line rebounding
 * inside a rounded square, suggesting tracking + alerting.
 */
export function Logo({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-8", className)}
      aria-hidden="true"
      {...props}
    >
      <rect width="32" height="32" rx="8" fill="url(#reclu-grad)" />
      {/* Rising chart line */}
      <path
        d="M7 21.5 12 16l3.5 3.5L21.5 11l3.5 3.5"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Alert dot at peak */}
      <circle cx="25" cy="14.5" r="2.6" fill="white" />
      <circle cx="25" cy="14.5" r="4.2" stroke="white" strokeWidth="1.4" opacity="0.5" />
      <defs>
        <linearGradient id="reclu-grad" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#2563eb" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Lockup: logo + wordmark. */
export function LogoLockup({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Logo className="size-7" />
      <span className="text-lg font-semibold tracking-tight text-ink-900">
        reclu<span className="text-brand-600">.cl</span>
      </span>
    </span>
  );
}
