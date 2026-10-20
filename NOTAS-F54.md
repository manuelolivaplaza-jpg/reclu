# F54 — API de datos chilenos: endpoints v1 y documentación

Rama: `v2/f54-api-datos-endpoints` (worktree `C:\reclu-work\f14`, base
`mejoras/integracion` con F53 fusionada). Sin push. Sin migraciones nuevas.
No se tocó Supabase real ni se levantó `npm run dev`.

> Nota: `scrapers/data/v2/F54/` no existía en este worktree. Los endpoints se
> apoyan en las tablas y semillas ya creadas por F14/F15/F24/F31/F32 y F10
> (`020`, `021`, `024`/`044`, `031`, `032`, `016`), no en fixtures nuevos.

## Qué se hizo

### 1. `src/lib/api-datasets.ts` — lista blanca cerrada

- `API_DATASETS` define los seis datasets publicados: `afp`, `corredoras`,
  `infoprobidad`, `dividendos`, `hechos` e `insiders`.
- Cada definición trae `label`, `description`, `license`, `licenseUrl`,
  `attribution`, `sourceUrl` y filtros admitidos. Es la misma metadata que
  viaja en cada respuesta JSON y la que pinta `/api-docs`.
- **Excluidos de forma explícita** (`EXCLUDED_API_DATASETS`, 404):
  - `house_ptr`
  - `senate_ptr`
  - `oge_278t`
  - `nport_subversive`
  - Motivo: 5 U.S.C. § 13107. Las declaraciones de funcionarios de EE.UU.
    siguen gratis y fuera de muros; no se redistribuyen por una API con clave
    ni por plan. Tampoco se exponen agregados de esas fuentes.
- **InfoProbidad** es la única con licencia de reutilización explícita:
  `license: "CC BY 4.0"`, atribución al Consejo para la Transparencia y
  enlace a la licencia. Solo se consultan columnas agregadas
  (`rut`, `nombre`, `symbol`, `autoridades`, `valor_declarado_clp`,
  `ultima_declaracion`, `updated_at`): nunca personas, cargos, direcciones ni
  familiares (Leyes 19.628 y 21.719).
- Paginación pura y testeable: `parsePagination()` (page/per_page o
  offset/limit, tope 100, default 50) y `paginationMeta()`.

### 2. `src/app/api/v1/[dataset]/route.ts` — endpoint JSON

`GET /api/v1/{afp|corredoras|infoprobidad|dividendos|hechos|insiders}`.

Orden de decisiones:

1. **Lista blanca primero**: cualquier slug fuera de `API_DATASETS` (incluidos
   los cuatro excluidos) responde **404** antes de mirar la clave o el flag.
2. Si `API_PUBLIC_ENABLED !== "true"` → **503**.
3. Sin Supabase configurado → **503**.
4. `Authorization: Bearer rcl_…`: formato inválido, prefijo inexistente,
   hash incorrecto o clave revocada → **401 genérico**
   (`"Clave de API inválida."`). No se distingue una revocada de una que nunca
   existió.
5. **Plan actual del dueño**: se lee `profiles.plan` en cada request con
   service role. No se usa `api_keys.plan`, así que si la persona baja de plan
   su clave deja de tener el límite anterior de inmediato.
6. Cuota diaria: se lee `api_usage` del día UTC, se decide con `rateLimit()` y
   se incrementa con la RPC `consume_api_usage`. Si no cabe → **429** con
   `rateLimitHeaders`. Cada respuesta 200 también lleva `X-RateLimit-*`.
7. `last_used_at` se actualiza best-effort para la pantalla de Ajustes.

Respuesta:

```json
{
  "dataset": "afp",
  "license": "…",
  "license_url": "…",
  "attribution": "…",
  "source_url": "…",
  "generated_at": "2026-10-20T…Z",
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 42,
    "total_pages": 1,
    "has_more": false
  },
  "data": []
}
```

Filtros por dataset:

| Dataset | Filtros |
| --- | --- |
| `afp` | `symbol` |
| `corredoras` | `symbol`, `portfolio` |
| `infoprobidad` | `symbol` |
| `dividendos` | `nemo`, `desde`, `hasta` |
| `hechos` | `emisor`, `categoria`, `desde`, `hasta` |
| `insiders` | `symbol`, `code` (`P`/`S`), `desde`, `hasta` |

Todos aceptan `page`, `per_page`, `offset` y `limit`.

Muro 048: los datasets actuales son públicos (ningún portafolio premium), pero
las consultas de holdings filtran `portfolio.premium = false` cuando el plan es
Gratis. Si en el futuro una cartera AFP/corredora pasa a premium, no se abre
por accidente. Los seis endpoints no exponen series de rendimiento, así que el
recorte de 90 días para Gratis no aplica todavía; queda anotado como deuda para
cuando se agregue un dataset de series.

### 3. `src/app/api-docs/page.tsx` — documentación pública

- Página estática (sin cookies ni searchParams) con `SiteHeader`/`SiteFooter`.
- Explica autenticación, ejemplo `curl`, datasets con licencia/atribución,
  paginación, forma de la respuesta, errores y límites por plan.
- Lista los datasets excluidos y por qué (5 U.S.C. § 13107).
- Usa `LegalNotice kind="fintec"` y `kind="us_disclosure"`.
- Desde Ajustes → API se agregó el enlace “Ver documentación de la API”.

### 4. Ajustes de revisión F53

- `authenticateApiKey()` ahora devuelve **401** (mismo mensaje) para claves
  revocadas; antes devolvía 403 y delataba el estado.
- `API_MAX_ACTIVE_KEYS = 5` + `activeApiKeyLimitReached()`.
- La server action de creación en `settings/api/page.tsx` cuenta las claves
  activas (`revoked = false`) con service role y bloquea la sexta. La UI puede
  avisar, pero la decisión es del servidor.
- Tests actualizados/nuevos en `tests/api-keys.test.ts`.

### 5. Tests

- `tests/api-datasets.test.ts` (16 tests):
  - los seis datasets publicados y los cuatro excluidos;
  - cada excluido responde **404** por el handler real, sin autenticar;
  - slug inventado 404;
  - InfoProbidad con `CC BY 4.0` y descripción de agregado;
  - paginación: defaults, topes, alias offset/limit y metadata.
- `tests/api-keys.test.ts`: 401 genérico para revocada + tope de 5 claves.

## Variables de entorno

| Variable | Valor | Efecto |
| --- | --- | --- |
| `API_PUBLIC_ENABLED` | `true` exacto | Enciende la API y la creación de claves. Cualquier otro valor deja todo en 503. Ya existía en F53; no hay variables nuevas. |

No se leyó ni modificó ningún `.env*`. No se tocó `.env.example` (lo une F57).

## Términos de las fuentes (revisión pendiente)

| Fuente | Estado | Nota |
| --- | --- | --- |
| Superintendencia de Pensiones (AFP) | **Pendiente** | Información pública; no se encontraron condiciones explícitas de reutilización. No se publican CUSIP. |
| BICE / MBI / consenso de corredoras | **Pendiente** | PDFs públicos; falta confirmar reutilización comercial. Renta 4 y BTG quedan fuera del consenso hasta revisar sus términos. |
| CMF (dividendos y hechos esenciales) | **Pendiente** | Datos públicos y oficiales; falta revisar condiciones de reutilización de la CMF. |
| InfoProbidad (Consejo para la Transparencia) | **OK** | CC BY 4.0, con atribución visible en cada respuesta. |
| SEC EDGAR Form 4 | **OK** | Obra del Gobierno de EE.UU.; se trata como dominio público. |

Las licencias de CMF y corredoras se muestran como “términos pendientes de
revisión” en cada respuesta. Antes de un uso comercial hay que confirmarlas y
actualizar `src/lib/api-datasets.ts` y esta nota.

## Verificación ejecutada

```bash
npx vitest run --maxWorkers=1          # 60 suites, 709 tests passed
npm run lint                           # OK
npm run typecheck                      # OK
```

No se corrió `npx next build`: lo ejecuta el orquestador (regla de RAM).
No se levantó servidor. No se aplicaron migraciones.

## Cómo probar

### Sin Supabase (modo local)

```bash
npx vitest run --maxWorkers=1 tests/api-datasets.test.ts
npx vitest run --maxWorkers=1 tests/api-keys.test.ts
npx vitest run --maxWorkers=1
npm run lint
npm run typecheck
```

Los tests de los datasets excluidos no necesitan clave: el handler devuelve
404 antes de cualquier consulta.

### Con Supabase de prueba

1. Aplicar las migraciones previas (incluida `040_api_claves.sql`, ya de F53).
2. Poner `API_PUBLIC_ENABLED=true` en `.env.local` (no versionado).
3. Entrar a `/settings/api`, crear una clave y copiarla (se muestra una vez).
4. Probar:

```bash
curl -i -H "Authorization: Bearer rcl_..." \
  "http://localhost:3000/api/v1/dividendos?page=1&per_page=50"

curl -i -H "Authorization: Bearer rcl_..." \
  "http://localhost:3000/api/v1/infoprobidad?symbol=LTM"

curl -i "http://localhost:3000/api/v1/house_ptr"   # 404
curl -i "http://localhost:3000/api/v1/afp"        # 401 sin clave
```

5. Revisar en `/api-docs` que cada dataset muestre su licencia y atribución.
6. Bajar el plan de un usuario en `profiles` y comprobar que su clave Pro pasa
   a límite Gratis en la siguiente llamada (no se lee `api_keys.plan`).

## Deudas / pendientes

1. **Términos CMF y corredoras**: revisión legal antes de uso comercial
   (ver tabla).
2. **Series de rendimiento**: si se agrega un dataset de performance, hay que
   aplicar el muro 048 completo (premium solo pro/elite y 90 días para free).
   Hoy las seis fuentes no exponen series.
3. **Carrera del contador**: la lectura de `api_usage` y el `consume_api_usage`
   no son una sola transacción. Con llamadas concurrentes en el borde del
   límite se puede pasar por una o dos unidades. Resolverlo requiere una RPC
   atómica con el límite como parámetro (migración nueva).
4. **`afp-consenso-chile`** queda fuera del endpoint `afp`: es una semilla demo
   con seguidores/retorno inventados. Solo se publica `afp-modelo-acciones-cl`
   (datos reales de la SP).
5. **Renta 4 y BTG** no están en `corredoras` hasta confirmar que sus pesos
   siguen vigentes y sus términos permiten reutilización.
6. **CORS**: no se habilitó `Access-Control-Allow-Origin`. Si se quiere llamar
   desde un frontend de terceros en el navegador, hay que definirlo con una
   lista de orígenes (no `*` a ciegas).
7. **Limpieza de `api_usage`**: crece una fila por clave y día; conviene borrar
   lo anterior a 90 días cuando la API esté encendida.
8. **Navegación**: `/api-docs` no está en el sitemap ni en el footer porque
   `sitemap.ts` y los archivos de registro los une F57. El enlace existe desde
   Ajustes → API.
