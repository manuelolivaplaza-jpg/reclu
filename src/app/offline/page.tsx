import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";

export const metadata = {
  title: "Sin conexión",
};

/**
 * Página offline del PWA: monocroma, con instrucciones claras.
 * El service worker (public/sw.js) la precachea y la sirve cuando una
 * navegación no tiene red. Lo que ya se visitó puede abrirse desde la copia
 * guardada; los datos en vivo no, y el texto lo dice tal cual.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main
        id="main"
        className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center"
      >
        <p className="label-line">Sin conexión</p>
        <h1 className="type-section mt-4 text-balance text-ink-900 dark:text-white">
          No pudimos cargar esta página
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-500 dark:text-ink-400">
          Revisa tu conexión a internet y vuelve a intentarlo. Las páginas que ya
          visitaste pueden abrirse desde la copia guardada, pero los datos en
          vivo no se actualizan hasta que recuperes la conexión.
        </p>
        <ButtonLink href="/" size="lg" className="mt-8 w-full sm:w-auto">
          Volver al inicio
        </ButtonLink>
      </main>
      <SiteFooter />
    </div>
  );
}
