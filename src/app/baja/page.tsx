import { connection } from "next/server";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LogoLockup } from "@/components/logo";
import { Button, ButtonLink } from "@/components/ui/button";

export const metadata = {
  title: "Baja de alertas",
  description: "Deja de recibir correos de alertas de fraccion.si",
};

// Lee el token de la URL por request — nunca se prerenderiza.
export const instant = false;

interface BajaPageProps {
  searchParams: Promise<{ token?: string; ok?: string; error?: string }>;
}

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Enlace de texto del pie: subrayado de 1px, negro en claro y blanco en oscuro. */
const quietLink =
  "font-medium text-ink-900 underline decoration-ink-300 decoration-1 underline-offset-4 transition-colors hover:decoration-ink-900 dark:text-white dark:decoration-white/40 dark:hover:decoration-white";

/**
 * Baja de alertas por correo. Solo se pinta uno de los tres desenlaces:
 * confirmación (token válido), baja hecha (ok=1) y enlace inválido o error.
 * El token y el POST a /api/unsubscribe no se tocan desde aquí.
 */
export default async function BajaPage({ searchParams }: BajaPageProps) {
  await connection();
  const params = await searchParams;
  const token = params.token ?? "";
  const done = params.ok === "1";
  const failed = params.error === "1";
  const valid = TOKEN_RE.test(token);

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <div className="container-page max-w-xl py-14 md:py-20">
          <LogoLockup className="block dark:text-white" />
          <p className="label-line mt-10">Baja de alertas</p>

          {done ? (
            <>
              <h1 className="type-section mt-3 text-ink-900 dark:text-white">
                Baja confirmada
              </h1>
              <p className="type-body mt-5">
                No te enviaremos más correos de alertas. Tu cuenta sigue activa y
                los portafolios que sigues quedan intactos.
              </p>
              <ButtonLink href="/" size="lg" className="mt-8 w-full sm:w-auto">
                Volver al inicio
              </ButtonLink>
            </>
          ) : failed ? (
            <>
              <h1 className="type-section mt-3 text-ink-900 dark:text-white">
                No pudimos procesar la baja
              </h1>
              <p className="type-body mt-5">
                El enlace pudo vencer o ya se usó. Abre el enlace de baja del
                último correo que te enviamos y vuelve a intentarlo. Si el
                problema sigue, escríbenos a{" "}
                <a href="mailto:hola@fraccion.si" className={quietLink}>
                  hola@fraccion.si
                </a>
                .
              </p>
              <ButtonLink
                href="mailto:hola@fraccion.si"
                variant="outline"
                size="lg"
                className="mt-8 w-full sm:w-auto"
              >
                Escribir a soporte
              </ButtonLink>
            </>
          ) : valid ? (
            <>
              <h1 className="type-section mt-3 text-ink-900 dark:text-white">
                ¿Dejar de recibir alertas?
              </h1>
              <p className="type-body mt-5">
                Confirma si quieres dejar de recibir los correos de alertas de
                los portafolios que sigues. Esta baja no cierra tu cuenta.
              </p>
              <form method="POST" action="/api/unsubscribe" className="mt-8">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="confirm" value="1" />
                <Button type="submit" size="lg" className="w-full sm:w-auto">
                  Confirmar baja
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="type-section mt-3 text-ink-900 dark:text-white">
                Este enlace no es válido
              </h1>
              <p className="type-body mt-5">
                El enlace está incompleto o no corresponde a una baja. Abre el
                enlace de baja del último correo que te enviamos.
              </p>
              <ButtonLink
                href="/"
                variant="outline"
                size="lg"
                className="mt-8 w-full sm:w-auto"
              >
                Volver al inicio
              </ButtonLink>
            </>
          )}

          <div className="mt-12 border-t border-ink-300 pt-6 dark:border-white/12">
            <p className="text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">
              <Link href="/settings" className={quietLink}>
                Ir a Ajustes
              </Link>
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
