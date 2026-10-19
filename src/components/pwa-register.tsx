"use client";

import { useEffect, useState } from "react";
import { Share, Plus } from "lucide-react";

/**
 * PwaRegister — registra el service worker y expone el botón "Instalar app"
 * (beforeinstallprompt en Android/Chrome; guía para iOS Safari).
 * Renderiza null hasta que hay algo que mostrar: cero costo en desktop.
 */
export function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registro falla silenciosamente: el sitio funciona igual */
      });
    }

    const isIosSafari =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !/crios|fxios/i.test(navigator.userAgent);
    setIsIos(isIosSafari);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as Event & { prompt: () => Promise<void> });
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Ya instalada o sin prompt disponible: no renderizamos nada.
  if (installed) return null;

  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={() => {
          deferredPrompt.prompt();
          setDeferredPrompt(null);
        }}
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+env(safe-area-inset-bottom)+1.25rem)] z-[60] inline-flex h-11 items-center gap-2 rounded-full bg-ink-900 px-5 text-sm font-medium text-white transition-colors hover:bg-black lg:bottom-6"
      >
        <Plus className="size-4" strokeWidth={2} />
        Instalar app
      </button>
    );
  }

  if (isIos) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIosHint((v) => !v)}
          className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+env(safe-area-inset-bottom)+1.25rem)] z-[60] inline-flex h-11 items-center gap-2 rounded-full bg-ink-900 px-5 text-sm font-medium text-white transition-colors hover:bg-black lg:bottom-6"
        >
          <Plus className="size-4" strokeWidth={2} />
          Instalar app
        </button>
        {showIosHint && (
          <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] border border-ink-900 bg-white p-5 lg:inset-x-auto lg:right-6 lg:bottom-24 lg:w-80">
            <p className="text-[15px] font-medium text-ink-900">Instalar en iPhone</p>
            <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink-500">
              <li className="flex gap-2">
                <span className="text-ink-900">1.</span>
                <span>
                  Toca <Share className="inline size-3.5 text-ink-900" strokeWidth={2} /> Compartir en la barra de Safari.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-ink-900">2.</span>
                <span>
                  Elige <strong className="font-medium text-ink-900">“Agregar a inicio”</strong>.
                </span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIosHint(false)}
              className="mt-4 text-[13px] font-medium text-ink-900 underline-offset-4 hover:underline"
            >
              Entendido
            </button>
          </div>
        )}
      </>
    );
  }

  return null;
}
