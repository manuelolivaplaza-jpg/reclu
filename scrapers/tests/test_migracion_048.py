"""La migracion 048 debe cerrar M6/M7 igual que la 012 cerro el muro de holdings.

Lee `supabase/migrations/048_muro_series_alertas.sql` como texto: sin Supabase,
sin red y sin base de datos. Correr:
  python -m pytest scrapers/tests/test_migracion_048.py
(o directo: python scrapers/tests/test_migracion_048.py).
"""

from __future__ import annotations

from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SQL_048 = RAIZ / "supabase" / "migrations" / "048_muro_series_alertas.sql"

FIRMAS = (
    "public.get_portfolio_performance(uuid)",
    "public.get_portfolio_metrics(uuid)",
    "public.get_alerts(uuid, integer)",
    "public.get_alert(uuid)",
)


def _sql() -> str:
    assert SQL_048.is_file(), f"falta {SQL_048}"
    # Normaliza CRLF para que las aserciones multilinea valgan en cualquier
    # checkout (Windows con core.autocrlf).
    return SQL_048.read_text(encoding="utf-8").replace("\r\n", "\n")


def _activo() -> str:
    """SQL que se ejecuta (sin el bloque -- rollback comentado)."""
    sql = _sql()
    corte = sql.find("-- ROLLBACK")
    assert corte > 0, "falta el bloque -- ROLLBACK"
    return sql[:corte]


def _bloque_funcion(nombre: str) -> str:
    sql = _activo()
    inicio = sql.find(f"create or replace function public.{nombre}(")
    assert inicio >= 0, f"falta la funcion {nombre}"
    fin = sql.find("$$;", inicio)
    assert fin > 0, f"la funcion {nombre} no cierra con $$;"
    return sql[inicio:fin]


def test_las_rpc_son_security_definer_con_search_path_vacio() -> None:
    for nombre in (
        "get_portfolio_performance",
        "get_portfolio_metrics",
        "get_alerts",
        "get_alert",
    ):
        bloque = _bloque_funcion(nombre)
        cabecera = bloque[: bloque.find("as $$")]
        assert "security definer" in cabecera, f"{nombre} no es security definer"
        assert "set search_path = ''" in cabecera, (
            f"{nombre} no fija search_path = ''"
        )
        assert "language sql stable" in cabecera


def test_grants_de_las_rpc_solo_a_anon_y_authenticated() -> None:
    sql = _activo()
    for firma in FIRMAS:
        assert f"revoke all on function {firma} from public;" in sql, (
            f"falta revoke from public de {firma}"
        )
        assert f"grant execute on function {firma} to anon, authenticated;" in sql, (
            f"falta grant execute de {firma}"
        )


def test_series_recortadas_a_90_dias_para_gratis() -> None:
    bloque = _bloque_funcion("get_portfolio_performance")
    # El corte se cuenta desde el ultimo punto de la serie (paridad con
    # trimSeriesToWindow de src/lib/backtest-window.ts).
    assert "max(x.date)" in bloque, "no calcula el ultimo punto de la serie"
    assert "or perf.date >= (corte.ultimo - 90)" in bloque, (
        "no recorta la serie a los ultimos 90 dias para anon/free"
    )
    # Premium + plan no pago => vacio; pago => serie completa.
    assert "public.current_user_plan() in ('pro', 'elite')" in bloque
    assert "not p.premium" in bloque
    # Excepcion legal de declaraciones publicas (misma lista que el front).
    assert "p.source in ('oge_278t', 'house_ptr', 'senate_ptr')" in bloque


def test_metricas_y_alertas_ocultan_premium_a_quien_no_paga() -> None:
    for nombre in ("get_portfolio_metrics", "get_alerts"):
        bloque = _bloque_funcion(nombre)
        assert "not p.premium" in bloque, f"{nombre} no distingue premium"
        assert "public.current_user_plan() in ('pro', 'elite')" in bloque, (
            f"{nombre} no deja pasar a pro/elite"
        )


def test_get_alerts_recorta_por_rol_y_esconde_summary() -> None:
    bloque = _bloque_funcion("get_alerts")
    assert "a.is_published = true" in bloque
    assert "then a.summary" in bloque, "no entrega summary a pro/elite"
    assert "else null" in bloque, "no anula summary para anon/free"
    assert "when public.current_user_plan() = 'free' then 10" in bloque
    assert "else 3" in bloque
    assert "least(coalesce(p_limit, 20), 100)" in bloque, (
        "el plan pago debe respetar p_limit con tope 100"
    )
    assert "p_portfolio is null or a.portfolio_id = p_portfolio" in bloque


def test_get_alert_una_sola_alerta_con_las_reglas_de_get_alerts() -> None:
    bloque = _bloque_funcion("get_alert")
    assert "where a.id = p_alert" in bloque, "no busca por id"
    assert "a.is_published = true" in bloque
    assert "p.is_active = true" in bloque
    assert "not p.premium" in bloque
    assert "public.current_user_plan() in ('pro', 'elite')" in bloque
    assert "then a.summary" in bloque, "no entrega summary a pro/elite"
    assert "else null" in bloque, "no anula summary para anon/free"
    assert "limit 1;" in bloque, "get_alert debe devolver una sola fila"


def test_sin_policies_de_lectura_publica_en_las_tablas_del_muro() -> None:
    sql = _activo()
    assert "using (true)" not in sql, "queda una policy de lectura publica total"
    assert (
        'drop policy if exists "performance public read" '
        "on public.portfolio_performance;" in sql
    )
    assert (
        'drop policy if exists "portfolio_metrics public read" '
        "on public.portfolio_metrics;" in sql
    )
    for policy in (
        "performance non premium read",
        "portfolio_metrics non premium read",
        "alerts non premium read",
    ):
        assert f'drop policy if exists "{policy}"' in sql, (
            f"la policy {policy} no es idempotente"
        )
        assert f'create policy "{policy}"' in sql, f"falta la policy {policy}"
    # Las nuevas policies exigen portafolio activo y no premium.
    assert sql.count("and not p.premium") >= 3


def test_alerts_deja_de_exponer_summary_por_lectura_directa() -> None:
    sql = _activo()
    assert 'drop policy if exists "alerts public read" on public.alerts;' in sql
    assert "p.id = alerts.portfolio_id" in sql

    # Vista publica sin la columna summary y con la RLS del invocador.
    inicio = sql.find("create or replace view public.alerts_public")
    assert inicio > 0, "falta la vista alerts_public"
    fin = sql.find("from public.alerts a", inicio)
    assert fin > inicio, "no encuentro el from de la vista alerts_public"
    definicion = sql[inicio:fin]
    assert "with (security_invoker = true)" in definicion
    assert "summary" not in definicion, "la vista alerts_public no debe traer summary"
    assert "revoke all on public.alerts_public from public;" in sql
    assert "grant select on public.alerts_public to anon, authenticated;" in sql

    # Privilegio de columna: summary fuera del select directo.
    assert (
        "revoke select (summary) on table public.alerts from anon, authenticated;"
        in sql
    ), "falta el revoke del privilegio de columna summary"
    # Un grant de tabla taparia el revoke de columna: se re-otorga por columnas.
    assert "revoke select on table public.alerts from anon, authenticated;" in sql
    assert (
        "grant select (\n"
        "  id, portfolio_id, type, severity, title, payload, is_published, created_at\n"
        ") on table public.alerts to anon, authenticated;" in sql
    ), "el grant por columnas debe excluir summary"


def test_rollback_comentado_y_completo() -> None:
    sql = _sql()
    rollback = sql[sql.find("-- ROLLBACK") :]
    assert "drop function if exists public.get_alert(uuid);" in rollback
    assert "drop function if exists public.get_alerts(uuid, integer);" in rollback
    assert "drop function if exists public.get_portfolio_metrics(uuid);" in rollback
    assert "drop function if exists public.get_portfolio_performance(uuid);" in rollback
    assert "drop view if exists public.alerts_public;" in rollback
    assert "reset (security_invoker)" in rollback
    assert "grant select on table public.alerts to anon, authenticated;" in rollback


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
