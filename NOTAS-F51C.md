# F51-C — Referidos reconciliados con la 009

Rama: `v2/f51c-referidos-reconciliar` (worktree `C:\reclu-work\f14`). Sin push,
sin Supabase real, sin servidores. Flujo apagado por defecto:
`REFERRALS_ENABLED=true` (exacto).

## Hecho

1. **`supabase/migrations/039_referidos.sql`** reescrita sobre la 009:
   - Fuera `profiles.referral_code`, backfill, `generate_referral_code()`,
     `set_referral_code()` y trigger `z_set_referral_code`.
   - Fuera el `create table`/policy duplicados: `referral_codes`, `referrals`,
     `handle_referral_code` y RLS son de la 009.
   - Queda un bloque `do $$` idempotente que agrega `unique (referred_id)`
     (`referrals_referred_id_key`) sólo si no hay un índice único equivalente.
   - Revokes de escritura para `anon`/`authenticated` y `grant select`.
   - `reward_referral(p_referred uuid)` intacta en lo esencial (security definer,
     `search_path = ''`, trusted, idempotente por `pending`, sin autorreferidos,
     1 mes de trial al patrocinador free) y ahora también marca
     `reward_applied = 'free_month'` y `reward_period_end`.

2. **`src/lib/referrals.ts`**: formato de la 009
   `^[a-z0-9]{3,6}-[a-f0-9]{4}$`; `normalizeReferralCode()` (trim + lower) e
   `isValidReferralCode()` que lo usa.

3. **`src/lib/supabase/middleware.ts`**: la cookie `reclu_ref` guarda el código
   normalizado.

4. **`src/app/actions/auth.ts`**: eliminado `recordReferral()` y el service
   client; con cookie válida + flag manda `referred_by` en `options.data` y el
   trigger de la 009 crea el vínculo. Mensaje genérico de M9 intacto.

5. **Ajustes**: el código propio se lee de `referral_codes` con el cliente del
   usuario (RLS "own referral code read"). `Profile.referral_code` eliminado.

6. **Tests**: `tests/referrals.test.ts` y `tests/referrals-flow.test.ts`
   ajustados; `tests/billing.test.ts` sin cambios y verde.

## Verificación

```bash
npm run lint                    # OK
npm run typecheck               # OK
npx vitest run --maxWorkers=1   # 53 archivos, 618 tests OK
```

No se corrió `next build` (lo corre el orquestador).

## Cómo probar

- Unitarios: los tres comandos de arriba; en particular
  `npx vitest run tests/referrals.test.ts tests/referrals-flow.test.ts tests/billing.test.ts --maxWorkers=1`.
- Staging (cuando se apliquen 009 + 039): abrir `/?ref=manuel-ab12`, crear
  cuenta y confirmar que el trigger creó `referral_codes` y una fila
  `referrals` pending con `referral_code = 'manuel-ab12'`; luego simular el
  primer pago y verificar `reward_referral` → `rewarded`, `reward_applied`,
  `reward_period_end` y `trial_ends_at` del patrocinador.

## Pendiente

- Probar el flujo completo en staging con las migraciones aplicadas.
- Google OAuth no pasa por `signUp`: hoy no manda `referred_by`.
- Documentar `REFERRALS_ENABLED` en `.env.example` (prohibido tocar `.env*`
  aquí).
- La cookie no se borra tras el signup; los constraints evitan duplicados.
