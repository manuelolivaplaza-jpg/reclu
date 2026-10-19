# Fixtures CMF (F31)

Capturados en vivo el **2026-10-19** desde `www.cmfchile.cl` (IP residencial).
El WAF de la CMF bloquea datacenters ("Web Page Blocked"), por eso el fixture
real se guarda aquí y no se baja en cada test.

| Archivo | Origen | Contenido |
| --- | --- | --- |
| `acc_dividendos_index.html` | GET `institucional/estadisticas/acc_dividendos_index.php` | Formulario `f1` (sociedad[], mes, anno, mes2, anno2, tipodiv). |
| `acc_dividendos1grid_2026.html` | GET `acc_dividendos1grid.php?lang=es&sociedad[]=0&mes=0&anno=2026&mes2=0&anno2=2026&tipodiv=0` | Grilla real de dividendos 2026 (transpuesta: columnas = sociedad+dividendo, filas = campos). |
| `acc_dividendos1grid_empty.html` | GET `acc_dividendos1grid.php?lang=es` (sin `sociedad[]`) | Caso "No se encuentran datos para su consulta". |
| `cmf_blocked_blocked_synthetic.html` | **Sintético** (no capturado) | Página de bloqueo del WAF, para probar `CmfBlocked`. Sustituir por una captura real cuando ocurra. |

La grilla real trae las filas `RUT`, `Razón social`, `Nemotécnico o nombre corto`,
`Número de dividendo`, `Tipo de dividendo (1)`, `Serie afecta`, `Fecha acuerdo`,
`Fecha de cierre`, `Fecha límite`, `Fecha de pago dividendos`, `Moneda`,
`Dividendo por acción`, `Número de acciones`, `Total (*)`, `Tasa de cambio`.
