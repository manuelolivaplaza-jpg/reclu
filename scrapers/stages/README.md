# Etapas de scrapers

Cada archivo `scrapers/stages/<nombre>.py` es una etapa nueva. `run_all.py` las descubre solo: no hace falta editar el orquestador para sumar una fuente.

Se ignoran `__init__.py` y los archivos cuyo nombre empieza con `_`. El orden es alfabético por nombre de archivo. Todas se insertan **antes** de `radar_ia`.

## Convención

```python
STAGE = ("mi_etapa", "Descripción corta", False)  # (id, desc, critical)

def run(db, dry_run) -> list[dict]:
    ...
```

- `id`: estable y único. Sirve para `--only` y `--skip`.
- `desc`: texto que muestra `--list`.
- `critical`: si es `True`, un fallo de esa etapa tumba la corrida.
- `run`: recibe el cliente de Supabase (`None` en `--dry-run`) y el flag. Devuelve una lista de dicts de resumen.

Con la carpeta vacía de etapas, `--list` y `--dry-run` se comportan como antes.
