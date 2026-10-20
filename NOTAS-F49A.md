# F49-A — Comunidad de creadores (modelo y validación)

Rama: `v2/f49a-comunidad-modelo` (desde `mejoras/integracion`). Sin push.

## Hecho

1. **`supabase/migrations/038_comunidad.sql`** (idempotente)
   - `creator_profiles`: un perfil por `auth.users` (`user_id` unique, FK
     `on delete cascade`), alias público único con regex
     `^[a-z0-9][a-z0-9_-]{2,29}$`, bio (≤600), `verificado` (default false),
     `conflicto_interes` (≤1000) y `declara_no_asesoria` (default false).
   - `creator_portfolios`: `creator_id` → `creator_profiles(id)`, título
     (3–120), descripción (≤2000), `holdings jsonb` (array), `estado`
     `pending|approved|rejected` default `pending`, `created_at`,
     `moderated_at`, `moderated_by`.
   - RLS: lectura pública solo de carteras `approved` y del perfil solo si
     `verificado = true` y tiene al menos una cartera aprobada. El dueño
     ve/crea/edita lo suyo, pero la edición solo aplica en `pending`; puede
     borrar propuestas propias aún pendientes.
   - Triggers `security definer` + `set search_path = ''` con canal
     `reclu.trusted` (patrón de la 007): en perfiles congela `user_id`,
     `verificado`, `created_at`; en carteras congela `creator_id`, `estado`,
     `moderated_at`, `moderated_by`, `created_at`. Al insertar, toda cartera
     nace `pending` y sin datos de moderación.
   - `EXECUTE` de las funciones de trigger revocado a `public, anon,
     authenticated`. Los helpers de RLS (`current_creator_id`,
     `creator_has_approved`) son `security definer` de solo lectura y se
     otorgan a `anon/authenticated` porque las políticas los evalúan con el
     rol del cliente (evitan la recursión de RLS).
   - Moderación: solo `service_role` (sin policies de moderación para
     clientes; service_role omite RLS).

2. **`src/lib/community.ts`**
   - `communityEnabled()`: solo `COMMUNITY_ENABLED === "true"` enciende la
     comunidad (mismo criterio que `src/lib/publish/flags.ts`).
   - Esquemas Zod: `creatorAliasSchema`, `creatorBioSchema`,
     `creatorProfileSchema`, `creatorPortfolioSchema` (título, descripción y
     holdings reutilizando `userHoldingSchema`).
   - `containsAdviceImperative(text)` + `ADVICE_PHRASES`: detecta lenguaje
     imperativo de inversión ("compra ya", "vendan ahora", "te recomiendo
     comprar"...). Normaliza minúsculas, tildes y puntuación, y compara con
     límites de palabra (no marca "comprenden").

3. **`tests/community.test.ts`** — 16 tests:
   - flag apagado por defecto y solo `"true"` lo enciende;
   - frases prohibidas detectadas (con tildes/mayúsculas) y textos neutros
     permitidos;
   - validación de alias/bio/perfil/portafolio/holdings;
   - lectura de `038_comunidad.sql`: RLS, `search_path = ''`, triggers
     `reclu.trusted`, revokes, idempotencia y regex.

## Verificación

```bash
npx vitest run tests/community.test.ts --maxWorkers=1
npx vitest run --maxWorkers=1   # 52 archivos / 604 tests OK
npm run lint
npm run typecheck
```

No se ejecutó `next build` ni `npm run dev` (los corre el orquestador).

## Pendiente / notas

- **No hay UI ni server actions todavía**: esta tarea es solo modelo de datos,
  librería de validación y tests. Falta el flujo de alta/edición de perfil y
  propuesta de cartera, la vista pública y el panel de moderación
  (`service_role`).
- **`COMMUNITY_ENABLED` no está en `.env.example`** a propósito (la tarea
  prohíbe tocar `.env*`). Añadirla al conectar la UI.
- **Revisión legal obligatoria antes de encender el flag (Ley Fintec
  21.521)**: la comunidad solo puede ser informativa; no se publican
  recomendaciones personalizadas, órdenes ni asesoría. Revisar también
  tratamiento de datos personales (Leyes 19.628 y 21.719), disclaimers
  visibles, conflicto de interés declarado y proceso de moderación/retiro de
  contenido. Mientras tanto, `communityEnabled()` devuelve `false` sin la
  variable.
- No existe `scrapers/data/v2/F49A/` en este worktree; la tarea no necesitó
  datos de esa carpeta.

## Cómo probar

```bash
npx vitest run tests/community.test.ts --maxWorkers=1
```

Para probar la migración (cuando haya Supabase de desarrollo): ejecutar
`supabase/migrations/038_comunidad.sql` dos veces seguidas en el SQL Editor;
no debe dar error. Luego, con un usuario autenticado, insertar un perfil y una
cartera (debe quedar `pending`), intentar cambiar `estado`/`verificado`
(debe revertirse) y aprobar con `service_role` para comprobar la lectura
pública.
