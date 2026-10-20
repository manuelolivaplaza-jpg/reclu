# NOTAS SC1 — webhook Telegram timing-safe (M4) + signup sin enumeración (M9)

Rama: `v2/sc1-api-puntuales` (desde `mejoras/integracion`). Sin push, sin `.env*`, sin Supabase real.

## Hecho

Commits (en orden):
1. `feat: extract timing-safe compare helper (M4 prep)`
   - Nuevo `src/lib/safe-compare.ts` con `timingSafeEqual(a, b)`: bucle de largo fijo
    que mezcla la diferencia de longitudes en `diff` sin abortar temprano.
   - `src/app/api/run-pipeline/route.ts` ahora importa el helper; se borró la copia
    local. **Comportamiento idéntico** (misma función, mismo 503/401).
2. `feat: M4 webhook timing-safe + fail closed, M9 signup without enumeration`
   - **M4** `src/app/api/telegram/webhook/route.ts`:
     - Sin `TELEGRAM_WEBHOOK_SECRET` configurado => **503** (falla cerrado; antes
      respondía 401, ahora se distingue "no configurado" de "secreto malo").
     - Con secreto configurado: header `x-telegram-bot-api-secret-token` se compara
      con `timingSafeEqual` (antes era `===`, vulnerable a timing attack).
     - Header ausente => 401 (se compara `""` contra el secreto, mismo costo).
   - **M9** `src/app/actions/auth.ts` (`signUp`):
     - Error de Supabase => mensaje genérico: "Si el correo es válido, te enviamos
      un enlace para continuar." (antes devolvía `error.message` crudo, p.ej.
      "User already registered" => enumeración de usuarios).
     - `console.error("[signup] ...", error.status, error.message)` solo en servidor,
      **sin el email**.
     - Errores Zod de validación de formulario se siguen mostrando igual (se
      retornan antes de llamar a Supabase).
3. Tests nuevos (8, todos pasan):
   - `tests/telegram-webhook.test.ts`: secreto ausente => 503; incorrecto => 401;
     header ausente => 401; correcto => 200. Mockea `@/lib/supabase-admin`.
   - `tests/signup-enumeration.test.ts`: "User already registered" => mensaje
     genérico (no el crudo); otro error Supabase => genérico; Zod email/password
     inválidos => error de validación visible (no el genérico). Mockea
     `@/lib/supabase/server` y `next/headers` (cookies).

## Pendiente

- `src/app/api/publish/draft/route.ts` tiene su propia copia local de
  `timingSafeEqual` (línea ~45). No se tocó en SC1 (fuera de alcance de "Leer
  antes"), pero es candidato obvio a reutilizar `@/lib/safe-compare` en otra SC.
- `signInWithGoogle` aún hace `throw new Error(error.message)` (no enumeración,
  pero expone mensajes crudos de Supabase). Fuera de alcance M9.
- No se corrió `npx next build` (lo corre el orquestador; no se tocaron páginas).

## Cómo probar

```bash
npm run lint && npm test && npm run typecheck
npx vitest run tests/telegram-webhook.test.ts tests/signup-enumeration.test.ts
```

Estado final: 44 archivos de tests, **507 pasando**, lint y typecheck limpios.

## Verificación de los 3 commits

- c0af72f `feat: extract timing-safe compare helper (M4 prep)` — helper + refactor run-pipeline, 499 tests verdes tras este commit.
- 666b279 `feat: M4 webhook timing-safe + fail closed, M9 signup without enumeration` — 507 tests verdes (8 nuevos).
- (este) `docs: SC1 notes` — solo este archivo.
