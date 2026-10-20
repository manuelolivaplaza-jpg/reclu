# Flujos de ETFs — verificado 2026-10-19
El CSV oficial de iShares (`ISHARES_HOLDINGS` en scrapers/etfs.py) trae en la cabecera `Shares Outstanding`:
ECH al "Oct 15, 2026": 24,700,000.00 (ver ech_csv_cabecera.txt). Flujo diario ≈ Δ acciones en circulación × NAV.
Los demás emisores (ARK, Global X, VanEck): verificar si publican acciones en circulación antes de incluirlos.
