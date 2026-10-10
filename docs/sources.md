# Fuentes de datos — reclu.cl

Documentación de cada fuente scrapeada, su estado y limitaciones conocidas.

## Resumen

| Fuente | Portafolio | Estado | Notas |
|---|---|---|---|
| Capitol Trades | pelosi-tracker, trump-trades | ⚠️ Login wall | Streaming RSC parseado; datos requieren auth |
| Renta 4 | renta4-moderada, renta4-moderada-ampliada | 🔧 Selectores a ajustar | HTML parsing genérico |
| InfoProbidad | infoProbidad-cl | 🔧 Dataset URL a confirmar | CSV público |
| House Disclosure (oficial) | political_us | ✅ Accesible | disclosures-clerk.house.gov |

## Capitol Trades (capitol_trades.py)

**URL:** `https://www.capitoltrades.com/trades?politician=<slug>`

**Arquitectura:** React Server Components (Next.js App Router). Los datos
viajan en el stream `self.__next_f.push([1,"..."])`, NO en `__NEXT_DATA__`
(era la arquitectura anterior, Pages Router).

**Limitación conocida:** Las páginas públicas devuelven `"data":[]` /
`"totalCount":0` — Capitol Trades requiere login para ver trades recientes.
El adaptador detecta esto y lo reporta claramente en los logs.

### Alternativas si se necesita datos sin auth
1. **House Financial Disclosure (oficial, gratuito):**
   `https://disclosures-clerk.house.gov/FinancialDisclosure`
   Fuente primaria del gobierno de EE.UU. Reportes en PDF por miembro.
2. **Quiver Quant API:** requiere API key (tier gratuito limitado).
3. **Unusual Whales:** requiere auth.

### Para habilitar datos reales
Opción A: obtener credenciales de Capitol Trades (no recomendado — TOS).
Opción B: implementar el scraper de House Financial Disclosure (recomendado).

---

## Renta 4 (renta4.py)

**URL base:** `https://www.renta4.cl`

**Estado:** El parser usa regex genérico para tablas HTML con tickers chilenos
(patrón `.SN` / IPSA) y porcentajes de peso. Si Renta 4 cambia su layout,
ajustar `_parse_table` en el código.

**Tickers chilenos:** BCS (Bolsa de Comercio de Santiago). Formato: `COPEC.SN`,
`SQM-B.SN`, etc. El adapter normaliza quitando el sufijo.

---

## InfoProbidad (infoprobidad.py)

**URL base:** `https://www.infoprobidad.cl`

**Estado:** Portal de datos abiertos de Chile. El adapter intenta descargar
un CSV de declaraciones (`/descargas/declaraciones-<año>.csv`). Las columnas
del dataset varían por año; el parser acepta múltiples nombres de columna
(`tipo_bien`/`tipo_activo`/`Tipo de Bien`, `valor`/`monto`/`Valor`).

---

## Flujo de datos

```
scraper.run()
    ↓ fetch_raw()      — descarga de la fuente
    ↓ normalize()      — convierte a Holding[]
    ↓ upsert()         — guarda en Supabase, detecta cambios
                           (peso anterior → previous_weight)
                           ↓
              Edge Function detect-changes (pg_cron, diario)
                           ↓ genera alerts (is_published=false)
                           ↓
              OpenRouter genera resumen AI → is_published=true
                           ↓
              Edge Function send-alerts (pg_cron, cada hora)
                           ↓
              Resend envía email a seguidores
```

## Cómo correr

```bash
cd scrapers
pip install -r requirements.txt
export SUPABASE_URL="https://<proj>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# Todas las fuentes
python run_all.py

# Solo una
python run_all.py --only capitol_trades
```

## Programar con cron

```bash
# Diario a las 7am CLT (10:00 UTC)
0 10 * * * cd /path/to/reclu/scrapers && /usr/bin/python3 run_all.py >> scraper.log 2>&1
```

O vía GitHub Actions / Vercel Cron (ver README).
