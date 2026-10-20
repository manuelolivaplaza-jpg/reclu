# NOTAS-X40B — reglas de alerta en el resumen semanal + paginación

Rama `v2/x40b-reglas-semanal-paginacion` (desde `mejoras/integracion`), worktree
`C:\reclu-work\f39`. Sin push. Detalle integrado también en `NOTAS-F40.md`
(sección X40B).

## Hecho

1. **Resumen semanal con reglas** (`supabase/functions/send-alerts/index.ts`,
   `routeRule`): en `mode === "weekly"` la regla aporta la alerta al correo si el
   perfil tiene `weekly_digest` activo (`!== false`) y no está
   `email_unsubscribed`; `telegram` siempre `false` (Telegram nunca va en el
   semanal). La deduplicación con follows ya existente (mapa `deliveries` por
   `alert_id`) hace que un follow + una regla del mismo usuario sean una sola
   entrega.
2. **Sin tope de 1000**:
   - `loadActiveRules()`: páginas de 1000 con `.order("id", { ascending: true })`
     y `.range(from, from + 999)`, corta cuando la página trae < 1000; tope de
     seguridad de 50 páginas con `console.error` claro si se alcanza.
   - `loadRuleProfiles()`: `.in("id", ...)` en lotes de 500 ids.
   - Si `alert_rules` no está disponible se conserva el fallback (follows siguen
     saliendo) y se registra el error.
3. **Tests** (`tests/alert-rules-routing.test.ts`): espejo de `routeRule` actualizado
   a weekly + espejo de paginación/lotes. 20 tests (antes 12):
   - weekly con `weekly_digest: true` → correo; con `false` → nada;
     `email_unsubscribed` → nada; Telegram nunca en weekly.
   - weekly suma la alerta al correo y deduplica con follow.
   - paginación 1000 + 3 → 1003 reglas en dos llamadas `[0,999]` / `[1000,1999]`;
     página incompleta corta; tope de 50 páginas avisa; perfiles en lotes
     500/500/201.
4. No se tocó `src/lib/alert-rules.ts`: esa copia es solo el match puro (no tiene
   `routeRule`).

## Verificación

```
npm run lint       # OK
npm run typecheck  # OK
npm test           # 487 tests / 42 suites OK
```

## Pendiente

- Sin deploy de la edge ni prueba contra Supabase real (lo hace Manu).
- El resumen semanal sigue tomando las 50 alertas publicadas más recientes (igual
  que antes); no se cambió la ventana temporal.

## Cómo probar

1. `npx vitest run tests/alert-rules-routing.test.ts`
2. Contra Supabase (Manu): `supabase functions deploy send-alerts`, crear una regla
   que coincida y con un perfil con `weekly_digest = true`, publicar la alerta y
   `POST .../functions/v1/send-alerts?mode=weekly`. Debe llegar el correo con la
   alerta una sola vez (aunque el usuario también siga el portafolio). Repetir con
   `weekly_digest = false` o `email_unsubscribed = true`: no debe llegar.
