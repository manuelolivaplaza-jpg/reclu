# NOTAS-DEMOS (D43)

Resumen para Manu: los portafolios con cifras inventadas quedan **ocultos**
(`is_active = false`, `hidden_reason = 'cifras_inventadas'`) con su slug
**redirigiendo a la versión real cuando existe**, sin borrar ninguna fila.

- Migración: `supabase/migrations/043_ocultar_demos.sql` (idempotente).
  - `elon-doge-tracker` → `musk-dice`
  - `trump-truth-signals` → `trump-dice`
  - `afp-consenso-chile` → `afp-modelo-acciones-cl`
  - `inverse-cramer` → `inverse-cramer-real` (solo si la real está activa)
- **Revertir:** `supabase/migrations/043_ocultar_demos_down.sql` (se corre a
  mano; NO en el flujo normal).
- Orden: la 043 es independiente; da igual si va antes o después de las v2
  (022-042). Aplicar después de la 021 si se sigue el orden numérico.

Detalle completo de lo hecho, verificación y pendientes en `NOTAS-D43.md`.

Probar: `npm run lint && npm test && npm run typecheck`
(no correr `npm run build`).
