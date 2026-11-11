import { cn } from "@/lib/utils";

/** Avatar de usuario con iniciales (sin imágenes generadas). */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .replace(/@.*/, "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "F";
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-ink-900 text-[12px] font-medium leading-none text-white",
        className,
      )}
    >
      {initials}
    </span>
  );
}
