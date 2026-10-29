"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { contextualHref } from "@/components/app/app-href";

type AppLinkProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

/**
 * Link que, dentro del dashboard, reescribe /explore y /portfolio/[slug]
 * a /app/explorar y /app/portafolio/[slug]. Fuera de la app es un Link normal.
 * Solo recibe strings (serializable desde Server Components).
 */
export function AppLink({ href, ...rest }: AppLinkProps) {
  const pathname = usePathname();
  return <Link href={contextualHref(href, pathname)} {...rest} />;
}

/** Hook para router.push y similares. */
export function useAppHref() {
  const pathname = usePathname();
  return (href: string) => contextualHref(href, pathname);
}