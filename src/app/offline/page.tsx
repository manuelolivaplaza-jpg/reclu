import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Sin conexión",
};

/** Página offline del PWA: monocroma, con instrucciones claras. */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="label-line">Sin conexión</p>
        <h1 className="type-section mt-4 text-ink-900">No pudimos cargar esta página</h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-500">
          Revisa tu conexión a internet y vuelve a intentarlo. Las páginas que ya
          visitaste siguen disponibles sin conexión.
        </p>
        <a
          href="/"
          className="mt-8 inline-flex h-12 items-center rounded-full bg-ink-900 px-[22px] text-[15px] font-medium text-white transition-colors hover:bg-black"
        >
          Volver al inicio
        </a>
        <p className="mt-10 max-w-md text-xs leading-relaxed text-ink-500">
          reclu muestra información pública con fines informativos. No constituye
          asesoría de inversión.
        </p>
      </main>
    </div>
  );
}
