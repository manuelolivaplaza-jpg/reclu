"use client";

import { useEffect, useState } from "react";
import { Share, Plus } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/** ¿Es Safari en iOS? (Chrome/Firefox de iOS no soportan instalar PWAs). */
function detectIosSafari(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !/crios|fxios/i.test(navigator.userAgent)
  );
}

/** ¿Ya está instalada como app? (standalone en iOS / display-mode en Android). */
function detectInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/**
 * PwaRegister — registra el service worker y expone el botón "Instalar app"
 * (beforeinstallprompt en Android/Chrome; guía para iOS Safari).
 * Renderiza null hasta que hay algo que mostrar: cero costo en desktop.
 */
export function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // Inicializadores perezosos: se evalúan una vez en el cliente, sin
  // setState síncrono dentro de effects.
  const [isIos] = useState(detectIosSafari);
  const [installed, setInstalled] = useState(detectInstalled);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registro falla silenciosamente: el sitio funciona igual */
      });
    }

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
  // Desactivado por ahora: tapaba el boton de la IA. Reactivar con
  // NEXT_PUBLIC_PWA_INSTALL_PROMPT=1 (el service worker sigue registrandose).
  if (process.env.NEXT_PUBLIC_PWA_INSTALL_PROMPT !== "1") return null;

  const buttonClass =
    "fixed right-4 bottom-[calc(env(safe-area-inset-bottom)*2+1.25rem)] z-[60] inline-flex h-11 items-center gap-2 rounded-full bg-ink-900 px-5 text-sm font-medium text-white transition-colors hover:bg-black lg:bottom-6";

  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={() => {
          deferredPrompt.prompt();
          setDeferredPrompt(null);
        }}
        className={buttonClass}
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
          className={buttonClass}
          aria-expanded={showIosHint}
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
