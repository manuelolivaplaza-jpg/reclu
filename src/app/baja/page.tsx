import { connection } from "next/server";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Baja de alertas",
  description: "Deja de recibir correos de alertas de fraccion.si",
};

// Lee el token de la URL por request — nunca se prerenderiza.
export const instant = false;

interface BajaPageProps {
  searchParams: Promise<{ token?: string; ok?: string; error?: string }>;
}

export default async function BajaPage({ searchParams }: BajaPageProps) {
  await connection();
  const params = await searchParams;
  const token = params.token ?? "";
  const done = params.ok === "1";
  const failed = params.error === "1";
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <div className="container-page max-w-xl py-16">
          <p className="text-[18px] font-semibold tracking-[-0.04em] text-ink-900">fraccion</p>
          <h1 className="mt-8 text-[32px] font-medium tracking-[-0.04em] text-ink-900">
            Correos de alertas
          </h1>

          {done ? (
            <p className="mt-4 text-[15px] leading-relaxed text-ink-500">
              Listo. No te enviaremos más correos de alertas.
            </p>
          ) : failed ? (
            <p className="mt-4 text-[15px] leading-relaxed text-ink-500">
              No pudimos procesar la baja. Usa el enlace del último correo.
            </p>
          ) : valid ? (
            <>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-500">
                Confirma si quieres dejar de recibir los correos de los portafolios que sigues.
                Esta acción no cierra tu cuenta.
              </p>
              <form method="POST" action="/api/unsubscribe" className="mt-8">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="confirm" value="1" />
                <Button type="submit">Confirmar baja</Button>
              </form>
            </>
          ) : (
            <p className="mt-4 text-[15px] leading-relaxed text-ink-500">
              El enlace no es válido. Usa el enlace de baja del último correo.
            </p>
          )}

          <p className="mt-10 border-t border-ink-200 pt-6 text-[13px] text-ink-500">
            <Link href="/settings" className="text-ink-900">
              Ir a Ajustes
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
