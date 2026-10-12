"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { X } from "lucide-react";

export type GateReason = "register" | "limit";

export function ChatGateModal({
  open,
  reason,
  onClose,
}: {
  open: boolean;
  reason: GateReason;
  onClose: () => void;
}) {
  const copy =
    reason === "register"
      ? {
          eyebrow: "Asistente IA",
          title: "Crea tu cuenta para seguir preguntando",
          body: "Llevas 2 consultas gratis. Con una cuenta gratuita tienes 5 al día, y los seguidores del portafolio tienen más. Guarda tu historial y retoma la conversación cuando quieras.",
          cta: "Crear cuenta gratis",
          ctaHref: "/signup",
          secondary: "Ya tengo cuenta",
          secondaryHref: "/login",
        }
      : {
          eyebrow: "Límite diario",
          title: "Has alcanzado tu límite de hoy",
          body: "Tu cuota se renueva mañana. Con el plan Pro tienes consultas con análisis más profundo, resúmenes AI de cada alerta y portafolios ilimitados.",
          cta: "Conocer el plan Pro",
          ctaHref: "/signup?plan=pro",
          secondary: "Volver al chat",
          secondaryHref: "",
        };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-30 flex items-center justify-center bg-ink-900/50 p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="relative w-full max-w-sm bg-background p-7"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 text-ink-500 transition-opacity hover:opacity-60"
              aria-label="Cerrar"
            >
              <X size={17} strokeWidth={1.8} />
            </button>

            <p className="text-[13px] text-ink-500">{copy.eyebrow}</p>
            <h2 className="mt-2 text-[24px] leading-tight font-medium tracking-[-0.03em] text-ink-900">
              {copy.title}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-500">{copy.body}</p>

            <div className="mt-6 flex flex-col gap-3">
              {copy.secondaryHref ? (
                <Link
                  href={copy.ctaHref}
                  className="block w-full bg-ink-900 py-3 text-center text-[15px] font-medium text-white transition-colors hover:bg-black"
                >
                  {copy.cta}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full bg-ink-900 py-3 text-center text-[15px] font-medium text-white transition-colors hover:bg-black"
                >
                  {copy.cta}
                </button>
              )}
              {copy.secondaryHref ? (
                <Link
                  href={copy.secondaryHref}
                  className="block text-center text-[14px] text-ink-900 underline-offset-2 hover:underline"
                >
                  {copy.secondary}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-center text-[14px] text-ink-500 underline-offset-2 hover:underline"
                >
                  {copy.secondary}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
