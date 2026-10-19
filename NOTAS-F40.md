# NOTAS-F40 — Alertas a medida: coincidencia en send-alerts

Rama: `v2/f40-reglas-alerta-envio` (desde `mejoras/integracion`). Sin push, solo
commits locales. Worktree `C:\reclu-work\f39`.

## Qué se hizo

1. **`supabase/functions/send-alerts/index.ts`** (Deno, excluido de tsconfig/lint
   como el resto de `supabase/functions`):
   - Copia pura de `ruleMatches` y todos sus auxiliares (`fold`, `ruleTokens`,
     `portfolioFieldMatches`, `pushMatchString`, `ticker/portfolio/sourceCandidates`,
     `readMatchNumber`, `maxUsdInText`, `parseMoneyToken`, `disclosedAmountUsd`) desde
     `src/lib/alert-rules.ts`. No importa desde `src/` (Deno no puede).
   - Nueva `routeRule(profile, ruleChannel, mode)`: el **canal lo elige la regla**
     (`email | telegram | both`) y la **frecuencia/baja las decide el perfil** (F4).
     - Sin Telegram disponible (plan pago/prueba **y** `telegram_chat_id`), una regla
       `telegram` cae a correo y `both` conserva solo el correo (igual que
       `normalizeChannel` de F4).
     - `instant`: solo frecuencia `realtime`; `daily`: correo para todos los no dados
       de baja, Telegram solo a quien no es realtime; `weekly`: las reglas no lo
       alimentan (el resumen semanal es genérico).
   - Se cargan las **reglas activas** (`alert_rules where active`) y, en una consulta
     aparte, los perfiles de sus dueños (no hay FK directa `alert_rules → profiles`,
     así que no se usa embedding PostgREST).
   - El armado de buckets ahora se hace por **usuario + alerta** con un mapa
     `deliveries` indexado por `alert_id`: **deduplica contra follows** y entre reglas,
     uniendo canales (`email` de un follow + `telegram` de una regla = una sola
     entrega con ambos canales). `alert_deliveries` sigue sin distinguir canal.
   - El correo (instant o digest) agrupa solo las alertas con canal correo; una regla
     solo-Telegram no contamina el digest. Se añadió `source` al select del portafolio
     para el match por fuente. La respuesta ahora incluye `rules` (cantidad evaluada).
2. **`tests/alert-rules-routing.test.ts`** (nuevo, 12 tests): espeja `routeRule` y el
   armado de buckets de la edge, pero usa el `ruleMatches` **real** de
   `src/lib/alert-rules.ts` y el `routeAlert` **real** de `src/lib/alert-routing.ts`
   (no duplica el match puro). Cubre canal/frecuencia, fallback Telegram→correo, baja
   de correo, semanal sin reglas, coincidencia por ticker/fuente/monto y
   **deduplicación** (follow + regla, dos reglas, usuarios distintos → sin duplicados).

## Variables de entorno nuevas

Ninguna. No se tocó `.env.example` (lo une F57).

## Verificación

- `npm run typecheck` → 0 · `npm run lint` → 0 · `npm test` → **392 tests / 35 suites OK**
  (antes 380/34; +12 nuevos).
- Migraciones requeridas presentes: `008_planes_alertas.sql`, `009_pagos_suscripciones.sql`,
  `014`–`021` (verificado con glob; no se ejecutó ninguna contra Supabase real).

## Pendiente / deudas

- **Sin verificar contra Supabase real** (no se desplegó la edge). Se asume que
  `alert_rules` existe (migration 037, F39) y que `portfolios.source` existe.
- El fetch de reglas activas tiene `limit(1000)`; con muchos usuarios habría que
  paginar o filtrar por las alertas del lote.
- Las reglas **no** alimentan el resumen semanal (`?mode=weekly`); si se quisiera,
  habría que decidir cómo combinar reglas con "lo que movieron los grandes".
- `alert_deliveries` no distingue canal (heredado de F4): una alerta entregada por
  correo no se reenvía por Telegram. En `instant` sigue siendo posible enviar correo
  **y** Telegram de la misma alerta (mismo comportamiento previo).
- Fallback: regla Telegram sin chat vinculado llega por correo (decisión documentada).

## Cómo probar

1. Unitario: `npm test` (o solo `npx vitest run tests/alert-rules-routing.test.ts`).
2. Contra Supabase (lo hace Manu, no el agente):
   - Aplicar migrations `037_reglas_alerta.sql` (si falta) y `008_planes_alertas.sql`.
   - `supabase functions deploy send-alerts`.
   - Crear una regla, publicar una alerta que coincida (`is_published = true`) y POST a
     `.../functions/v1/send-alerts` (sin `?mode` hace pasada `instant` + `daily`).
   - Revisar `alert_deliveries`: debe haber **una fila por usuario y alerta**, sin
     duplicados aunque el usuario siga el portafolio y además tenga una regla.
