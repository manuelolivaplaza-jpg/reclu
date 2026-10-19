# Fuentes de datos — Trump dice

- **`trump_dice_menciones.json`**: las 15 menciones verificadas de Donald Trump
  (Truth Social, X/Twitter, discursos, entrevistas) que llaman a comprar o
  elogian directamente a una empresa cotizada, con cita textual, canal, fecha,
  fecha de entrada al portafolio simulado y al menos una fuente con URL. Cada
  mención lleva `id` externo (`M01`..`M15`) que se guarda en
  `public.mentions.external_id` para no duplicar. Incluye la lista de
  `excluidas` (empresas privadas, actos de gobierno sin dicho de Trump,
  elogios colectivos) y por qué quedaron fuera.

  Regla de inclusión: dicho público del propio Trump que (a) llama a comprar
  una empresa cotizada o el mercado, o (b) elogia directa e individualmente a
  una empresa cotizada o su acción. No es una lista exhaustiva.

  Metodología completa de la simulación: `docs/trump-dice-metodologia.md`
  y la página `/metodologia` del sitio (sección "Trump dice").

- **Precios**: cierres ajustados (dividendos y splits) de Yahoo Finance, mismo
  método que `benchmarks.py`/`prices.py`. U.S. Steel (X) se deslistó el
  2025-06-18 (compra de Nippon Steel a US$55 en efectivo): su posición queda
  valorizada a US$55 (cash-out) y el holding se publica como `USD-CASH`
  con `asset_class='cash'`.
