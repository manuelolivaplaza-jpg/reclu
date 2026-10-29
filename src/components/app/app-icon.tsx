"use client";

import {
  LayoutDashboard,
  Compass,
  BellRing,
  PieChart,
  Wallet,
  Settings,
  Sparkles,
  Menu,
  LogOut,
  Star,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import type { AppIconName } from "@/components/app/nav-config";

const ICONS = { LayoutDashboard, Compass, BellRing, PieChart, Wallet, Settings, Sparkles, Menu, LogOut, Star, MessageCircle } satisfies Record<
  AppIconName,
  LucideIcon
>;

/** Ícono por nombre (string). Resuelto en el cliente para no reabrir el bug d46. */
export function AppIcon({ name, className, strokeWidth = 1.75 }: { name: AppIconName; className?: string; strokeWidth?: number }) {
  const Icon = ICONS[name];
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}