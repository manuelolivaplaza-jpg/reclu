import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/session";
import { ChatShell } from "@/components/chat/chat-shell";

export const metadata: Metadata = {
  title: "Reclu IA",
  robots: { index: false, follow: false },
};

export default async function ChatPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/chat");
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  const firstName = (meta.full_name ?? meta.name ?? "").split(" ")[0] || null;
  return <ChatShell firstName={firstName} />;
}
