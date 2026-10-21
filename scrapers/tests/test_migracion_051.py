"""La migracion 051 debe dejar las noticias e impacto con permisos minimos.

Lee `supabase/migrations/051_noticias_impacto.sql` como texto: sin Supabase,
sin red y sin base de datos. Correr desde `scrapers/`:
  uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_migracion_051.py
(o directo: uv run python tests/test_migracion_051.py).
"""

from __future__ import annotations

from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SQL_051 = RAIZ / "supabase" / "migrations" / "051_noticias_impacto.sql"


def _sql() -> str:
    assert SQL_051.is_file(), f"falta {SQL_051}"
    # Normaliza CRLF para que las aserciones multilinea valgan en cualquier
    # checkout (Windows con core.autocrlf).
    return SQL_051.read_text(encoding="utf-8").replace("\r\n", "\n")


def _activo() -> str:
    """SQL que se ejecuta (sin el bloque -- rollback comentado)."""
    sql = _sql()
    corte = sql.find("-- ROLLBACK")
    assert corte > 0, "falta el bloque -- ROLLBACK"
    return sql[:corte]


def _tabla(nombre: str) -> str:
    sql = _activo()
    inicio = sql.find(f"create table if not exists public.{nombre} (")
    assert inicio >= 0, f"falta la tabla {nombre}"
    fin = sql.find("\n);", inicio)
    assert fin > inicio, f"la tabla {nombre} no cierra con );"
    return sql[inicio:fin]


def _funcion(nombre: str) -> str:
    sql = _activo()
    inicio = sql.find(f"create or replace function public.{nombre}(")
    assert inicio >= 0, f"falta la funcion {nombre}"
    fin = sql.find("$$;", inicio)
    assert fin > 0, f"la funcion {nombre} no cierra con $$;"
    return sql[inicio:fin]


def _grant_columnas_news_items() -> str:
    sql = _activo()
    inicio = sql.find("grant select (\n  id, source, url, title, published_at\n)")
    assert inicio >= 0, "falta el grant por columnas de news_items"
    fin = sql.find(";", inicio)
    return sql[inicio:fin]


def test_news_items_solo_expone_titular_url_y_fecha() -> None:
    bloque = _tabla("news_items")

    # Fuentes gratis verificadas de la tarea.
    assert "check (source in ('sec_8k', 'cmf_hechos'))" in bloque
    # Resumen propio corto: nunca el texto completo.
    assert "check (char_length(summary) <= 500)" in bloque
    assert "hash text not null" in bloque
    assert "constraint news_items_hash_key unique (hash)" in bloque
    assert "published_at timestamptz not null" in bloque

    sql = _activo()
    assert 'create policy "news_items public read"' in sql
    assert 'drop policy if exists "news_items public read"' in sql

    # El patron de la 048: se revoca el select de tabla y se re-otorga por
    # columnas, dejando summary fuera del alcance de anon/authenticated.
    assert "revoke select on table public.news_items from anon, authenticated;" in sql
    grant = _grant_columnas_news_items()
    assert "summary" not in grant, "summary no debe ir en el grant de columnas"
    for columna in ("id", "source", "url", "title", "published_at"):
        assert columna in grant, f"falta {columna} en el grant de news_items"


def test_news_tickers_relacion_confianza_y_lectura_publica() -> None:
    bloque = _tabla("news_tickers")
    assert "references public.news_items (id) on delete cascade" in bloque
    assert "relation in ('direct', 'sector', 'supplier', 'competitor', 'macro')" in bloque
    assert "confidence >= 0 and confidence <= 1" in bloque
    assert "primary key (news_id, symbol, relation)" in bloque

    sql = _activo()
    assert 'create policy "news_tickers public read"' in sql
    assert (
        "create index if not exists idx_news_tickers_symbol\n"
        "  on public.news_tickers (symbol);" in sql
    ), "falta el indice news_tickers(symbol)"
    assert (
        "create index if not exists idx_news_items_published_at\n"
        "  on public.news_items (published_at desc);" in sql
    ), "falta el indice news_items(published_at desc)"
    # Escritura solo service_role.
    assert "revoke all on table public.news_tickers from anon, authenticated;" in sql
    assert "grant all on table public.news_tickers to service_role;" in sql


def test_ticker_profile_lectura_publica_y_escritura_cerrada() -> None:
    bloque = _tabla("ticker_profile")
    assert "symbol text primary key" in bloque
    for columna in ("sector", "industry", "country"):
        assert columna in bloque
    for arreglo in ("peers", "suppliers", "macro_factors"):
        assert f"{arreglo} text[]" in bloque, f"falta {arreglo}"
    assert "updated_at timestamptz not null default now()" in bloque

    sql = _activo()
    assert 'create policy "ticker_profile public read"' in sql
    assert "revoke all on table public.ticker_profile from anon, authenticated;" in sql
    assert "grant select on table public.ticker_profile to anon, authenticated;" in sql
    assert "grant all on table public.ticker_profile to service_role;" in sql


def test_ai_impact_cache_no_guarda_datos_del_usuario() -> None:
    bloque = _tabla("ai_impact_cache")
    assert "user_id" not in bloque, "ai_impact_cache no debe tener user_id"
    assert "references public.news_items (id) on delete cascade" in bloque
    assert "primary key (news_id, symbol, prompt_version)" in bloque
    assert "analysis jsonb not null" in bloque

    sql = _activo()
    assert "alter table public.ai_impact_cache enable row level security;" in sql
    # Sin policies: RLS niega todo a anon/authenticated.
    assert 'policy "ai_impact_cache' not in sql
    assert "revoke all on table public.ai_impact_cache from public, anon, authenticated;" in sql
    assert "grant all on table public.ai_impact_cache to service_role;" in sql


def test_user_impact_requests_solo_del_dueno() -> None:
    bloque = _tabla("user_impact_requests")
    assert "references auth.users (id) on delete cascade" in bloque
    assert "references public.news_items (id) on delete cascade" in bloque
    assert "delivered_via in ('web', 'email', 'telegram')" in bloque

    sql = _activo()
    assert 'create policy "user_impact_requests own read"' in sql
    assert 'create policy "user_impact_requests own insert"' in sql
    assert sql.count("auth.uid() = user_id") >= 2, (
        "select e insert deben exigir auth.uid() = user_id"
    )
    # anon no participa; authenticated solo lee e inserta lo propio.
    assert (
        "revoke all on table public.user_impact_requests from public, anon, authenticated;"
        in sql
    )
    assert "grant select, insert on table public.user_impact_requests to authenticated;" in sql
    assert "grant all on table public.user_impact_requests to service_role;" in sql


def test_purga_de_90_dias_solo_service_role() -> None:
    bloque = _funcion("purge_old_impact_requests")
    cabecera = bloque[: bloque.find("as $$")]
    assert "security definer" in cabecera
    assert "set search_path = ''" in cabecera
    assert "delete from public.user_impact_requests" in bloque
    assert "interval '90 days'" in bloque, "la purga debe ser a los 90 dias"

    sql = _activo()
    assert (
        "revoke execute on function public.purge_old_impact_requests() "
        "from anon, authenticated;" in sql
    )
    assert (
        "grant execute on function public.purge_old_impact_requests() to service_role;" in sql
    )
    assert (
        "grant execute on function public.purge_old_impact_requests() to anon" not in sql
    )


def test_rollback_comentado_y_completo() -> None:
    sql = _sql()
    rollback = sql[sql.find("-- ROLLBACK") :]
    for tabla in (
        "user_impact_requests",
        "ai_impact_cache",
        "ticker_profile",
        "news_tickers",
        "news_items",
    ):
        assert f"drop table if exists public.{tabla};" in rollback, (
            f"falta el drop de {tabla} en el rollback"
        )
    assert "drop function if exists public.purge_old_impact_requests();" in rollback


if __name__ == "__main__":
    fallos = 0
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok    {nombre}")
            except AssertionError as exc:
                fallos += 1
                print(f"FAIL  {nombre}: {exc}")
    raise SystemExit(1 if fallos else 0)
