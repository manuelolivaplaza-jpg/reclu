"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Bloque de código de widget para /medios: código del iframe listo para
 * copiar + vista previa en vivo. Tipografía mono (num) sobre filete de 1px,
 * sin sombras, botón píldora outline (docs/hermes-diseno.md).
 */
export function WidgetEmbedCode({
  code,
  previewUrl,
  height,
}: {
  code: string;
  previewUrl: string;
  height: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin Clipboard API (http no-secure): el código queda visible para
      // copiar a mano. No inventamos feedback de éxito.
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-stretch gap-2">
        <code className="num min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-none border border-ink-200 px-3 py-2.5 text-[12px] leading-relaxed text-ink-600">
          {code}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-live="polite"
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-ink-900 px-4 text-[13px] font-medium text-ink-900 transition-colors hover:bg-ink-50"
        >
          {copied ? (
            <>
              <Check className="size-3.5" aria-hidden />
              Copiado
            </>
          ) : (
            <>
              <Copy className="size-3.5" aria-hidden />
              Copiar
            </>
          )}
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-ink-500">
        Vista previa en vivo — así se ve el widget hoy:
      </p>
      <div className="mt-1.5 border border-ink-200 p-3">
        <iframe
          src={previewUrl}
          width="100%"
          height={height}
          style={{ border: 0 }}
          title="Vista previa del widget de reclu.cl"
          loading="lazy"
        />
      </div>
    </div>
  );
}
