import { connection } from "next/server";
import { ResumenView } from "@/components/dashboard/resumen/resumen-view";

export const metadata = { title: "Resumen" };
// Auth-gated route: reads cookies at request time — never prerendered.
export const instant = false;

export default async function DashboardPage() {
  await connection();
  return <ResumenView />;
}
