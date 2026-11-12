import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/session";
import { ChatShell } from "@/components/chat/chat-shell";

export const metadata: Metadata = {
  title: "Fraccion IA",
  robots: { index: false, follow: false },
};

// Ruta protegida por auth: lee cookies por request — nunca se prerenderiza.
export const instant = false;

export default async function ChatPage() {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/chat");
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  const firstName = (meta.full_name ?? meta.name ?? "").split(" ")[0] || null;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ChatShell firstName={firstName} />
    </div>
  );
}
