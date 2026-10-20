# F21-A — Autorización de /admin

## Hecho

1. **`src/lib/admin.ts`** — contrato compartido:
   - `adminEmails()` lee `ADMIN_EMAILS` (lista separada por comas), normaliza a
     minúsculas y recorta espacios.
   - `isAdmin(email)` devuelve `false` si el email viene vacío/null o si
     `ADMIN_EMAILS` no existe/está vacío (**falla cerrado**).
   - **Desvío documentado:** no se importó `server-only` porque ese paquete no
     está instalado en el repo (`node_modules/server-only` no existe) y habría
     roto typecheck/build/tests. El módulo es solo para servidor por convención;
     no debe importarse desde componentes cliente.
2. **Sesión en `/admin`** (`src/lib/supabase/middleware.ts`, invocado por
   `src/proxy.ts`): `/admin` y `/admin/*` se sumaron a `isProtected`, así que
   sin sesión redirigen a `/login?next=<ruta>`. El proxy **no** decide quién es
   admin; solo exige sesión.
3. **`src/lib/admin-guard.ts`** — `requireAdmin()`:
   - `createClient()` + `auth.getUser()`.
   - Sin usuario o email fuera de `ADMIN_EMAILS` → `notFound()` (404, no 403),
     para no revelar la ruta.
   - Devuelve el `user` cuando es admin.
4. **`tests/admin-auth.test.ts`** (9 tests, todo mockeado, sin red/Supabase):
   - `isAdmin` con `ADMIN_EMAILS` indefinido/vacío, mayúsculas/espacios, email
     no listado.
   - `requireAdmin` sin usuario y con no-admin → `notFound`; admin → devuelve
     user.
   - `proxy` en `/admin` y `/admin/usuarios` sin sesión → redirect 307 a
     `/login` con `next`.

## Pendiente / notas para F21-B

- Cada página y layout bajo `src/app/admin/` debe llamar `await requireAdmin()`
  al inicio (el proxy solo cubre la sesión). No existe aún `src/app/admin/`.
- `ADMIN_EMAILS` debe configurarse en Vercel/Supabase (entorno del servidor).
  Sin ella, **nadie** puede entrar a `/admin` (comportamiento intencional).
- No se agregó `server-only` a `package.json`. Si se decide instalarlo, agregar
  el import en `src/lib/admin.ts` y mockearlo en el test
  (`vi.mock("server-only", () => ({}))`).

## Variables de entorno

| Variable       | Ejemplo                          | Efecto                          |
| -------------- | -------------------------------- | ------------------------------- |
| `ADMIN_EMAILS` | `manu@reclu.cl,ops@reclu.cl`     | Allowlist de emails admin       |

## Cómo probar

```bash
cd C:\reclu-work\f48
npx vitest run tests/admin-auth.test.ts   # 9 tests
npm run lint
npm test                                  # 43 archivos / 508 tests
npm run typecheck
```

Manual: con sesión iniciada de un email que **no** esté en `ADMIN_EMAILS`,
visitar `/admin` debe dar 404; sin sesión, redirige a `/login?next=/admin`.
