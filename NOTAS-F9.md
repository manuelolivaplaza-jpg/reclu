# NOTAS-F9 — /accion/[symbol] con el muro de pago de la 012

Rama: `mejoras/f9-fix-accion`. Estado: **hecho en esta rama** (sin push).

La 012 quitó el `SELECT` público de `holdings`. La página por ticker ya no
lee esa tabla directo como camino principal.

## Qué cambió

1. `supabase/migrations/015_holders_por_simbolo.sql`
   - `public.get_symbol_holders(p_symbol text)`, misma firma de siempre.
   - `security definer`, `set search_path = ''`, `stable`, `language sql`.
   - Idempotente (`create or replace`) y `grant execute` a `anon` y
     `authenticated`. Rollback comentado al final: `drop function`.
   - **Rank corregido.** Antes `row_number()` corría solo sobre las filas del
     símbolo, así que el rank quedaba en 1 y el anónimo veía la posición
     aunque no estuviera en su top N. Ahora:
     1. CTE `latest`: `max(as_of)` por cartera activa, sobre todos sus holdings.
     2. CTE `ranked`: `row_number()` de ese libro (`weight desc, id`).
     3. Recién ahí se filtra el símbolo.
   - La fila sale solo si ese rank cabe en
     `holdings_limit_for_plan(current_user_plan())` (`null` = sin límite,
     pro/elite). Cartera `premium` solo si el plan es `pro` o `elite`.

2. `src/lib/ticker-queries.ts`
   - `getTickerOverview()` mantiene la forma de `TickerOverview`.
   - Con Supabase: `supabase.rpc("get_symbol_holders", { p_symbol })`.
     Cada fila se mapea a `SymbolHolderRow` con `rankInPortfolio: null`
     (la RPC ya recortó) y pasa por `trimHoldersForRole` (defensa: premium).
   - Si la RPC da error (015 no aplicada): `createAdminClient()`. Con service
     key lee el libro del `as_of` vigente de las carteras que tienen el
     símbolo, `rankAtLatestAsOf()` calcula el rank y `trimHoldersForRole()`
     recorta con `roleFor(await getProfile())` de `access.ts`. Esas filas de
     más no salen del servidor.
   - Sin service key: la lectura directa de antes y el mismo recorte. Sin
     rank (la lectura pública no trae el libro) `rankInPortfolio` queda
     `null`: no se inventa un rank 1. Con la 012 aplicada esa lectura vuelve
     vacía.
   - Puras y exportadas: `trimHoldersForRole`, `rankAtLatestAsOf`.

3. `tests/ticker-access.test.ts`
   - `trimHoldersForRole`: anon top 5, free top 10, pro (`paid`) todo;
     premium oculto para anon/free y visible para pro; `rankInPortfolio: null`
     no recorta de más y sí oculta premium.
   - `rankAtLatestAsOf`: rank del libro completo (un símbolo en el puesto 6
     no entra al anónimo), ignora fechas viejas, empate por `id`, carteras
     separadas.

4. `supabase/migrations/README.md` ya lista la 015 (fila reservada F9).
   Aplicar **después** de la 012.

La página `src/app/accion/[symbol]/page.tsx` no cambió: sigue consumiendo
`TickerOverview`. `instant = false` ya estaba.

## Cómo probar

En el SQL Editor, en orden, las dos son re-ejecutables:

1. `012_muro_pago.sql` si aún no está.
2. `015_holders_por_simbolo.sql`.

Sin variables nuevas. El respaldo usa `SUPABASE_SERVICE_ROLE_KEY`, la misma
de `.env.example`.

Caso del bug: una cartera con seis posiciones y el símbolo en el peso más
bajo. Anónimo no debe ver esa fila en `/accion/[symbol]`. Free la ve si el
rank es 6–10. Pro ve todo, incluidas las carteras premium.

Tests de este frente:

```bash
npm test -- tests/ticker-access.test.ts
```

## Verificación de este run (2026-10-19)

| Comando | Resultado |
|---|---|
| `npm run lint` | OK |
| `npm test` | OK, 12 archivos, 123 tests |
| `npm run build` | OK. `/accion/[symbol]` queda en prerender parcial |
| `npm run typecheck` | OK después del build |

`tsc` aislado, antes de que `next build` escriba `.next/types`, marca
`LayoutProps` en `src/app/layout.tsx`. Es el tipo global de Next 16; el
build lo genera y el typecheck de después pasa. No es de este frente.

No levanté el dev server ni pegué contra Supabase: este run no despliega y
no abre servidores. El muro nuevo es de datos (RPC + recorte en servidor),
no de layout.
