# Pipeline diario de datos (D35)

Un solo comando, en orden fijo: `cd scrapers && python run_all.py`
(`--dry-run` para probar sin escribir; `--list` muestra las etapas).

## Orden (run_all.STAGES)

1. **Posiciones**: house_disclosure*, senate_disclosure, renta4*, btg_pactual*, infoprobidad, sec13f, etfs (* = crítica: afecta el código de salida).
2. **Precios y retornos**: prices (Yahoo, tope `PRICES_MAX_SYMBOLS`, default 1500), compute_returns.
3. **Series reales**: etf_series (ETFs), benchmarks (^GSPC, ^IPSA), performance (estimadas solo donde no hay serie real).
4. **Eventos**: trump_dice, insiders_form4, oge_trump, musk_dice, inverse_cramer, **event_series** (Trump, Musk, Inverse Cramer real y compras).
5. **AFP**: spensiones (Modelo), **afp_carteras** (las otras 6), **afp_series** (serie mensual real + consenso).
6. **Etapas descubiertas** (`scrapers/stages/*.py`, orden alfabético): activistas, recompras, CMF, corredoras, flujos ETF, NANC/GOP, noticias, OGE, Polymarket, spin-offs, perfil por ticker.
7. **radar_ia** y al final **trade_alerts** (correo solo con `TRADE_ALERTS_SEND_ENABLED=true`).

Después, el workflow llama a `/api/run-pipeline` (detect-changes + send-alerts) si `APP_URL` está configurado.

Una etapa que falla no corta las demás; solo las críticas cambian el código de salida.

## Dónde correrlo: GitHub Actions (recomendado)

- `.github/workflows/scrapers.yml`: todos los días a las 11:00 UTC (08:00 Chile en verano, 07:00 en invierno), `timeout-minutes: 150`, cache de `scrapers/data/afp_cuadro14` y del cache de resolve_tickers.
- Vercel Cron **no sirve** para los scrapers: son Python, tardan 30–90 min y las funciones de Vercel cortan a los 60–300 s. D44: ya no hay Vercel Cron; `/api/run-pipeline` lo dispara solo el workflow (paso con `!cancelled()`, corre aunque fallen los scrapers).
- D44: se quitó el cron duplicado de `vercel.json`; `/api/run-pipeline` corre una vez al día, al final del workflow.
- Secrets del repo (Settings → Secrets → Actions): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `APP_URL`.
- Senado (efdsearch) responde 403 desde Chile y desde el box; desde runners de GitHub (EE.UU.) puede funcionar. Si falla, la etapa termina con "BLOQUEADO" y no corta la corrida.

## Tareas que NO van en el diario

- `resolve_tickers.py` (nombres → tickers): a mano o semanal, con `--plan-sql` para fusiones revisables.
- `price_coverage.py --dry-run --probe`: auditoría de activos sin precio (semanal o tras cambios grandes).
- `cramer_history.py`, `reconstruct_history.py`: backfills puntuales.
