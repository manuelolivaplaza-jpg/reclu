# Portafolios y seguimientos propuestos (datos públicos verificables)

Leyenda. Gratis: costo de la fuente. Dificultad: B/M/A (baja, media, alta). "¿Alerta?": si sirve como aviso en tiempo real o casi.
Competencia: Quiver (datasets de su API y su sitio) y Autopilot (portafolios para copiar). Lo marcado "?" no lo confirmé.
Todo lo dicho sobre interés del mercado es HIPÓTESIS.

| # | Seguimiento | Fuente de datos | Gratis | Frecuencia | Dificultad | ¿Alerta? | ¿Lo tienen? |
|---|---|---|---|---|---|---|---|
| 1 | **Trump dice** (dichos de compra o elogio) | Truth Social (truthsocial.com/@realDonaldTrump), trumpstruth.org, American Presidency Project | Sí | Minutos a horas | M (detectar menciones y verificarlas a mano) | Sí, la mejor | Autopilot tiene "Donald Trump's Stock Portfolio", basado en lo que posee, no en lo que dice. Quiver tiene "Trump trades". Lo que dice como portafolio: no lo vi en ninguno |
| 2 | **Trump compra** (sus operaciones declaradas) | OGE, formularios 278-T y 278e (extapps2.oge.gov) | Sí | Mensual/trimestral, con atraso de 30–45 días | M (PDF largos, miles de filas) | Sí (al publicarse cada formulario) | Autopilot sí; Quiver sí |
| 3 | **Insiders (formulario 4)**: compras de CEOs y directores | SEC EDGAR, feed de formularios 4 (sec.gov/cgi-bin/browse-edgar?action=getcurrent) | Sí | Tiempo real (2 días hábiles de plazo legal) | M | Sí | Quiver sí (plan pagado) |
| 4 | **Berkshire en tiempo real** (formularios 4, 13D/G y 13F de Buffett) | SEC EDGAR, CIK 1067983 | Sí | Evento + trimestral | B (ya hay `sec13f.py`) | Sí | Autopilot tiene Buffett por 13F. En tiempo real con formulario 4: no lo vi |
| 5 | **Contratos del gobierno de EE.UU.** (empresas con mayores adjudicaciones nuevas) | USAspending.gov API, avisos de contratos de defensa.gov | Sí | Diaria | M | Sí | Quiver sí |
| 6 | **Lobby** (quién gasta más en lobby) | Senate LDA API (lda.senate.gov) | Sí | Trimestral | B | No (resumen trimestral) | Quiver sí |
| 7 | **Cathie Wood / ARK diario** | CSV diarios de ARK (ya en `etfs.py`) + correo diario de operaciones de ARK | Sí | Diaria | B | Sí ("ARK compró X hoy") | Autopilot ?; Quiver no |
| 8 | **Elon Musk dice** (empresas o cripto que nombra en X) | API de X (`x` ya conectado) o archivo de posts de @elonmusk | Sí, con límites | Minutos | M–A (mucho ruido) | Sí | Ninguno como portafolio de dichos (?) |
| 9 | **Inverse Cramer** (lo contrario de lo que recomienda Jim Cramer) | Lightning Round y Mad Money, cnbc.com; ETF SJIM cerrado en 2024 | Sí | Diaria | A (no hay un dataset limpio de sus recomendaciones) | Medio | Autopilot tuvo "Inverse Cramer" (?). Hoy `load_thematic.py` usa SQQQ y PSQ como proxy: conviene reemplazarlo |
| 10 | **Noruega (NBIM)**: el fondo soberano más grande | nbim.no, holdings anuales y semestrales (CSV) + 13F de Norges Bank (CIK 1374170) | Sí | Semestral + trimestral | B | No | Quiver por 13F (?) |
| 11 | **Opciones inusuales y mayores compradores** | Sin fuente pública gratis confiable (OCC entrega agregados; el flujo cuesta) | No | Intradía | A | Sí | Quiver lo tiene pagado. NO recomendado al inicio |
| 12 | **WallStreetBets / Reddit** (las acciones más mencionadas) | API de Reddit (r/wallstreetbets), con tope de llamadas gratis | Parcial | Horaria | M | Sí | Quiver tenía un dataset, detenido en febrero de 2025 |
| 13 | **AFP chilenas** (en qué acciones y fondos invierte cada AFP) | Superintendencia de Pensiones, "Inversión de los Fondos de Pensiones" (spensiones.cl, mensual en Excel) + CMF | Sí | Mensual | M | Sí (cambios mensuales) | Nadie (ventaja local) |
| 14 | **InfoProbidad**: acciones que declaran las autoridades chilenas | infoprobidad.cl, datos abiertos SPARQL (ya en `infoprobidad.py`) | Sí | Al publicarse cada declaración (anual + al asumir) | B–M | Sí (nueva declaración) | Nadie (ventaja local) |

Recomendación de orden: 1 → 3 → 13 → 4 → 5 → 2. Lo local (13 y 14) no lo tiene la competencia.
HIPÓTESIS: el público chileno valora más las AFP y los dichos de Trump que el lobby o las opciones.
