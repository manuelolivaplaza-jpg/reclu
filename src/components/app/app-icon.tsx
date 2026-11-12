"use client";

import {
  LayoutDashboard,
  Compass,
  BellRing,
  PieChart,
  Wallet,
  Settings,
  CreditCard,
  Menu,
  LogOut,
  Star,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import type { AppIconName } from "@/components/app/nav-config";

const ICONS = { LayoutDashboard, Compass, BellRing, PieChart, Wallet, Settings, CreditCard, Menu, LogOut, Star, MessageCircle } satisfies Record<
  AppIconName,
  LucideIcon
>;

/**
 * Ícono por nombre (string). Resuelto en el cliente para no reabrir el bug d46.
 * Trazo de 1.5 px, tamaño heredado del contenedor (16 px en navegación) y
 * siempre decorativo: el texto del enlace es el nombre accesible.
 */
export function AppIcon({ name, className, strokeWidth = 1.5 }: { name: AppIconName; className?: string; strokeWidth?: number }) {
  const Icon = ICONS[name];
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}