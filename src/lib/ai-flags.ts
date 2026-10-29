import { chatIaConfig } from "@/lib/chat-ia/openrouter-tools";

/**
 * Flag server-side de IA: true solo si el proceso tiene clave y modelo de
 * OpenRouter (misma regla que el chat, incluida la lista de modelos
 * vetados). Sin clave se ocultan el chat y todo CTA de IA ("Resumen AI
 * disponible en Pro", "Explicar con IA", "Pregunta a la IA").
 * Solo se consulta process.env; nunca se lee un archivo .env.
 */
export function aiEnabled(): boolean {
  return chatIaConfig().enabled;
}
