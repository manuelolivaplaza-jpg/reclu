# SD2C — explain-alert y alertas premium (pro/elite)

Rama: `v2/sd2c-explica-premium` (desde `mejoras/integracion`). Sin push.

## Hecho

1. **Migración `supabase/migrations/048_muro_series_alertas.sql`**
   - Nueva RPC `public.get_alert(p_alert uuid) returns setof public.alerts`.
   - Mismas reglas que `get_alerts`:
     - alerta publicada (`is_published = true`) y portafolio activo;
     - portafolios premium solo para `pro`/`elite`;
     - `summary` null salvo para `pro`/`elite`;
     - `limit 1`.
   - `language sql stable`, `security definer set search_path = ''`.
   - `revoke all ... from public` + `grant execute ... to anon, authenticated`.
   - Agregada al bloque `-- ROLLBACK`.
   - Cabecera de la migración actualizada.

2. **`src/app/api/explain-alert/route.ts`**
   - Deja de leer `alerts` directo.
   - Usa `supabase.rpc("get_alert", { p_alert })` con el cliente de sesión
     (`createClient` de `@/lib/supabase/server`), nunca service role.
   - Lee el portafolio en consulta aparte (`slug, name, manager, category`).
   - Eliminada la búsqueda dentro de `get_alerts` y el tope de 100.
   - Normaliza la respuesta de la RPC (`setof` llega como array; acepta fila
     suelta por robustez ante stubs).
   - Errores de RPC/portafolio => 500; alerta ausente => 404.

3. **Tests**
   - `tests/explain-alert.test.ts` reescrito con `rpc` mockeado:
     - pro + alerta premium => 200 y el `summary` llega al prompt;
     - free + alerta premium => 404 (la RPC devuelve vacío);
     - free + alerta no premium => 200 sin `summary`;
     - alerta inexistente => 404; error de RPC => 500;
     - confirma que se usa `get_alert` y no `get_alerts` ni `.from("alerts")`.
   - `scrapers/tests/test_migracion_048.py` ampliado: `get_alert` en firmas,
     cabecera `security definer` + `search_path = ''`, grants, reglas de
     negocio y `drop` en rollback.

## Verificación

```bash
npx vitest run --maxWorkers=1 tests/explain-alert.test.ts   # 8 pasan
npm test                                                    # 672 pasan
npm run lint                                                # OK
npm run typecheck                                           # OK
uv run --with pytest python -m pytest scrapers/tests/test_migracion_048.py -q  # 9 pasan
```

Nota: `python` no está en el PATH de esta máquina; el pytest se corrió con
`uv run --with pytest python ...` (Python administrado por `uv`).

## Pendiente

- No se aplicó la migración en Supabase real (fuera de alcance).
- No se corrió `next build` (lo hace el orquestador).
- Sin push, por instrucción.
