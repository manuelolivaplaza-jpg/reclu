# Portafolio simulado "Trump dice": metodología

Corte: cierre del 16-10-2026 (último día hábil antes del 19-10-2026).
Archivos: `menciones.json` (menciones con cita y fuentes), `trump_dice_posiciones.csv`,
`trump_dice_curva_diaria.csv`, `trump_dice.json` (resumen + posiciones + fuentes), `calcular.py`.

## 1. Qué cuenta como mención
- Un dicho público del propio Donald Trump (Truth Social, X/Twitter, discurso o entrevista) que
  (a) llama a comprar una empresa cotizada o el mercado ("go out and buy a Dell", "GREAT TIME TO BUY"), o
  (b) elogia directamente y en forma individual a una empresa cotizada o a su acción (Intel, Palantir con ticker, Micron, U.S. Steel, Apple).
- Cada mención tiene al menos una fuente con URL: el archivo del post (truthsocial.com, trumpstruth.org,
  American Presidency Project) o un medio (CNBC, Reuters, AP, Yahoo Finance, Quartz, Business Insider, Politico).
- Quedan fuera las empresas privadas (Goya 2020, L.L.Bean 2017), los actos de gobierno sin dicho de Trump
  (MP Materials) y los elogios colectivos dentro de listas de empresas (unas 50 en el dataset de Hudson Labs).
  Ver `excluidas` en `menciones.json`.
- No es una lista exhaustiva: es el conjunto verificado de llamados de compra y elogios directos
  más citados entre agosto de 2025 y octubre de 2026. El portafolio usa solo menciones con entrada desde el 2025-08-06 (M04-M15, 12 de 15: AAPL, INTC, DELL, MU, PLTR); M01 TSLA, M02 SPY y M03 X quedan fuera. Configurable con TRUMP_DICE_FECHA_INICIO.

## 2. Simulación
- Se compran US$1.000 por mención, al cierre del día de la mención. Si el dicho ocurrió después del
  cierre (16:00 ET), un fin de semana o un feriado, se compra al cierre del siguiente día hábil.
  Si la hora no está confirmada, se usa el cierre del mismo día (Apple 06-08-2025 es la excepción:
  el evento fue en la tarde y se usa el 07-08 por prudencia).
- Se compra y se mantiene; nunca se vende. Las menciones repetidas de una empresa (Dell x5, Intel x4)
  se suman como compras nuevas.
- Comparación: por cada mención se compran también US$1.000 de SPY en la misma fecha (aportes iguales,
  en las mismas fechas).
- Precios: cierres ajustados por dividendos y splits de Yahoo Finance (yfinance, `auto_adjust=True`).
- U.S. Steel (X) se deslistó: los cierres del 23-05, 27-05 y 30-05-2025 vienen de exa.ai. Desde el
  18-06-2025 la posición queda en efectivo a US$55 por acción (precio pagado por Nippon Steel, según el
  comunicado de U.S. Steel). El horizonte de 1 semana de X usa el 30-05-2025 (4 sesiones, por el feriado
  de Memorial Day).
- Horizontes del "efecto Trump": 1 día = 1 sesión después de la entrada, 1 semana = 5 sesiones,
  1 mes = 21 sesiones. Se mide desde el cierre de entrada, así que el salto intradía del mismo día
  (por ejemplo, el +9,5% del 09-04-2025 o el +14% de Dell el 08-05-2026) NO se captura: sería el
  retorno de quien compra tarde, al cierre.
- Mención M02 ("GREAT TIME TO BUY!!! DJT"): el caso base compra SPY. Como sensibilidad, se calcula
  con DJT (Trump Media).

## 3. Límites y sesgos
- Sesgo de selección: las menciones famosas son las que se movieron, y las de 2025 tienen más tiempo
  para rendir. 15 posiciones, muy concentradas en Dell (5) e Intel (4): el resultado depende de dos acciones.
- No incluye costos, impuestos ni tipo de cambio (todo en US$).
- Es información histórica, no una recomendación.
