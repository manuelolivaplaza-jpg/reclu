# reclu.cl

Plataforma de seguimiento y alertas de portafolios. Monitorea portafolios de
políticos de EE.UU., corredoras chilenas y fondos; envía alertas por email con
análisis AI cuando hay cambios. **Solo notificaciones — no ejecuta órdenes.**

## Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **Backend:** Supabase (Postgres, Auth, Edge Functions, RLS)
- **AI:** OpenRouter (modelos económicos para resúmenes)
- **Email:** Resend
- **Scrapers:** Python 3.11+ (httpx + supabase-py)
- **Deploy:** Vercel

## Inicio rápido

### 1. Clonar e instalar

```bash
git clone <repo-url>
cd reclu
npm install
```

### 2. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com)
2. Ve a **SQL Editor** y ejecuta `supabase/schema.sql` completo
   (crea tablas, RLS, triggers y datos seed)
3. Copia las credenciales de **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (solo backend)

### 3. Configurar Auth de Google (opcional)

1. Supabase Dashboard → **Authentication → Providers → Google**
2. Crea un OAuth client en [Google Cloud Console](https://console.cloud.google.com)
3. Agrega el callback URL de Supabase a los redirect URIs autorizados
4. Copia Client ID y Secret a Supabase

En **Authentication → URL Configuration**:
- Site URL: `http://localhost:3000` (dev) / `https://reclu.cl` (prod)
- Redirect URLs: `http://localhost:3000/auth/callback` y `https://reclu.cl/auth/callback`

### 4. Configurar variables de entorno

```bash
cp .env.example .env.local
# Edita .env.local con tus valores
```

### 5. Correr en desarrollo

```bash
npm run dev
# Abre http://localhost:3000
```

## Desplegar edge functions

```bash
# Instalar Supabase CLI
npm i -g supabase

# Login y vincular proyecto
supabase login
supabase link --project-ref <tu-ref>

# Desplegar funciones
supabase functions deploy detect-changes
supabase functions deploy send-alerts

# Configurar secrets
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key>
supabase secrets set OPENROUTER_API_KEY=<key>
supabase secrets set RESEND_API_KEY=<key>
supabase secrets set EMAIL_FROM="reclu.cl <alertas@reclu.cl>"
```

### Programar detección de cambios (pg_cron)

```sql
-- Cada día a las 10:00 UTC (07:00 CLT)
select cron.schedule(
  'detect-changes-daily',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://<tu-ref>.functions.supabase.co/detect-changes',
    headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb
  );
  $$
);
```

## Scrapers

```bash
cd scrapers
pip install -r requirements.txt

export SUPABASE_URL="https://<proj>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<key>"

python run_all.py                    # todas las fuentes
python run_all.py --only capitol_trades
```

Ver `docs/sources.md` para detalles de cada fuente y limitaciones conocidas.

## Desplegar en Vercel

1. Importa el repo en [vercel.com](https://vercel.com/new)
2. Agrega las variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL=https://reclu.cl`
   - `OPENROUTER_API_KEY` (si usas AI desde el servidor)
   - `RESEND_API_KEY` (si envías emails desde API routes)
3. Deploy. Vercel detecta Next.js automáticamente.

## Estructura

```
reclu/
├── src/
│   ├── app/
│   │   ├── (auth)/          # login, signup
│   │   ├── (dashboard)/     # dashboard, alerts, settings, compare
│   │   ├── explore/         # catálogo de portafolios
│   │   ├── portfolio/[slug] # detalle de portafolio
│   │   ├── api/follow/      # API follow/unfollow
│   │   ├── auth/            # callback OAuth, signout
│   │   ├── actions/         # server actions
│   │   └── page.tsx         # landing
│   ├── components/          # UI + sections
│   └── lib/                 # supabase clients, queries, types
├── supabase/
│   ├── schema.sql           # esquema completo + RLS + seed
│   └── functions/           # edge functions (Deno)
├── scrapers/                # pipelines Python
└── docs/                    # documentación de fuentes
```

## Modelo freemium

| Feature | Gratis | Pro |
|---|---|---|
| Portafolios seguidos | 2 | Ilimitados |
| Alertas por email | Diario (batch) | Tiempo real |
| Resúmenes AI | ❌ | ✅ |
| Portafolios premium | ❌ | ✅ |
| Comparar cartera | ✅ | ✅ |

## Disclaimer

Información pública con fines informativos. **No constituye asesoría de
inversión.** Rentabilidades pasadas no garantizan resultados futuros.

## Licencia

Privado — © 2026 reclu.cl
