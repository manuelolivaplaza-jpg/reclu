# NOTAS-F40 â€” Alertas a medida: coincidencia en send-alerts

Rama: `v2/f40-reglas-alerta-envio` (desde `mejoras/integracion`). Sin push, solo
commits locales. Worktree `C:\reclu-work\f39`.

## QuÃ© se hizo

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
       alimentan (el resumen semanal es genÃ©rico).
   - Se cargan las **reglas activas** (`alert_rules where active`) y, en una consulta
     aparte, los perfiles de sus dueÃ±os (no hay FK directa `alert_rules â†’ profiles`,
     asÃ­ que no se usa embedding PostgREST).
   - El armado de buckets ahora se hace por **usuario + alerta** con un mapa
     `deliveries` indexado por `alert_id`: **deduplica contra follows** y entre reglas,
     uniendo canales (`email` de un follow + `telegram` de una regla = una sola
     entrega con ambos canales). `alert_deliveries` sigue sin distinguir canal.
   - El correo (instant o digest) agrupa solo las alertas con canal correo; una regla
     solo-Telegram no contamina el digest. Se aÃ±adiÃ³ `source` al select del portafolio
     para el match por fuente. La respuesta ahora incluye `rules` (cantidad evaluada).
   - **Falla elegante**: si `alert_rules` no existe (037 sin aplicar) o fallan los
     perfiles de las reglas, se registra el error y se continÃºa con los follows; las
     alertas de seguidores nunca se caen por las reglas.
2. **`tests/alert-rules-routing.test.ts`** (nuevo, 12 tests): espeja `routeRule` y el
   armado de buckets de la edge, pero usa el `ruleMatches` **real** de
   `src/lib/alert-rules.ts` y el `routeAlert` **real** de `src/lib/alert-routing.ts`
   (no duplica el match puro). Cubre canal/frecuencia, fallback Telegramâ†’correo, baja
   de correo, semanal sin reglas, coincidencia por ticker/fuente/monto y
   **deduplicaciÃ³n** (follow + regla, dos reglas, usuarios distintos â†’ sin duplicados).

## Variables de entorno nuevas

Ninguna. No se tocÃ³ `.env.example` (lo une F57).

## VerificaciÃ³n

- `npm run typecheck` â†’ 0 Â· `npm run lint` â†’ 0 Â· `npm test` â†’ **392 tests / 35 suites OK**
  (antes 380/34; +12 nuevos).
- Migraciones requeridas presentes: `008_planes_alertas.sql`, `009_pagos_suscripciones.sql`,
  `014`â€“`021` (verificado con glob; no se ejecutÃ³ ninguna contra Supabase real).

## Pendiente / deudas

- **Sin verificar contra Supabase real** (no se desplegÃ³ la edge). Se asume que
  `alert_rules` existe (migration 037, F39) y que `portfolios.source` existe.
- El fetch de reglas activas tiene `limit(1000)`; con muchos usuarios habrÃ­a que
  paginar o filtrar por las alertas del lote.
- Las reglas **no** alimentan el resumen semanal (`?mode=weekly`); si se quisiera,
  habrÃ­a que decidir cÃ³mo combinar reglas con "lo que movieron los grandes".
- `alert_deliveries` no distingue canal (heredado de F4): una alerta entregada por
  correo no se reenvÃ­a por Telegram. En `instant` sigue siendo posible enviar correo
  **y** Telegram de la misma alerta (mismo comportamiento previo).
- Fallback: regla Telegram sin chat vinculado llega por correo (decisiÃ³n documentada).

## CÃ³mo probar

1. Unitario: `npm test` (o solo `npx vitest run tests/alert-rules-routing.test.ts`).
2. Contra Supabase (lo hace Manu, no el agente):
   - Aplicar migrations `037_reglas_alerta.sql` (si falta) y `008_planes_alertas.sql`.
   - `supabase functions deploy send-alerts`.
   - Crear una regla, publicar una alerta que coincida (`is_published = true`) y POST a
     `.../functions/v1/send-alerts` (sin `?mode` hace pasada `instant` + `daily`).
   - Revisar `alert_deliveries`: debe haber **una fila por usuario y alerta**, sin
     duplicados aunque el usuario siga el portafolio y ademÃ¡s tenga una regla.

## X40B — reglas en el semanal + paginación (misma rama de trabajo)

- **`routeRule` en `weekly`**: una regla con match ahora suma la alerta al correo
  semanal si el perfil tiene `weekly_digest` activo (`!== false`, mismo criterio que
  `routeAlert`) y no está `email_unsubscribed`. Telegram nunca va en weekly
  (`telegram: false`), ni siquiera con chat vinculado. La deduplicación con follows
  es la existente (`deliveries` por `alert_id`): seguir el portafolio y tener la
  regla produce una sola entrega. El canal de la regla (`email`/`telegram`/`both`)
  no cambia la decisión en weekly: el resumen es informativo y va por correo.
- **Paginación**: `loadActiveRules()` lee `alert_rules` activas con
  `.order("id").range(from, from+999)` hasta una página incompleta; tope de
  seguridad de 50 páginas (50.000 reglas) con `console.error` si se alcanza.
  `loadRuleProfiles()` pide los perfiles en lotes de 500 ids. Si `alert_rules`
  falla se mantiene el fallback: follows siguen saliendo.
- **Tests** (`tests/alert-rules-routing.test.ts`, +8: 20 en total): weekly con
  digest activo ? correo; digest false ? nada; baja ? nada; Telegram fuera del
  weekly; entrega semanal deduplicada con follow; paginación 1000+3 (dos páginas
  `[0,999]` y `[1000,1999]`), corte en página incompleta, tope de 50 páginas y
  lotes de perfiles 500/500/201.
- **Verificación**: `npm run lint` OK · `npm run typecheck` OK · `npm test`
  **487 tests / 42 suites OK**.
- **Pendiente**: sin deploy ni prueba contra Supabase real.
