"""La migración 052 debe espejar los topes de Mi portafolio de plans.ts (F74).

Lee `supabase/migrations/052_limites_portafolio.sql` como texto: sin Supabase,
sin red y sin base de datos. Correr desde `scrapers/`:
  uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_migracion_052.py
"""

from __future__ import annotations

from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SQL_052 = RAIZ / "supabase" / "migrations" / "052_limites_portafolio.sql"


def _sql() -> str:
    assert SQL_052.is_file(), f"falta {SQL_052}"
    # Normaliza CRLF para que las aserciones multilinea valgan en cualquier
    # checkout (Windows con core.autocrlf).
    return SQL_052.read_text(encoding="utf-8").replace("\r\n", "\n")


def _activo() -> str:
    """SQL que se ejecuta (sin el bloque -- ROLLBACK comentado)."""
    sql = _sql()
    corte = sql.find("-- ROLLBACK")
    assert corte > 0, "falta el bloque -- ROLLBACK"
    return sql[:corte]


def _bloque_funcion() -> str:
    sql = _activo()
    inicio = sql.find("create or replace function public.enforce_user_holdings_limit(")
    assert inicio >= 0, "falta la función enforce_user_holdings_limit"
    fin = sql.find("$$;", inicio)
    assert fin > 0, "la función no cierra con $$;"
    return sql[inicio:fin]


def test_funcion_security_definer_con_search_path_vacio() -> None:
    bloque = _bloque_funcion()
    cabecera = bloque[: bloque.find("as $$")]
    assert "language plpgsql" in cabecera
    assert "security definer" in cabecera, "el trigger debe saltar la RLS"
    assert "set search_path = ''" in cabecera, "falta search_path = ''"


def test_topes_por_plan_iguales_a_plans_ts() -> None:
    bloque = _bloque_funcion()
    assert "when coalesce(v_plan, 'free') = 'elite' then 200" in bloque, (
        "Elite debe permitir 200 posiciones"
    )
    assert "when v_paid then 50" in bloque, "Pro (y la prueba) debe permitir 50"
    assert "else 10" in bloque, "Gratis debe permitir 10"


def test_la_prueba_vigente_cuenta_como_pro() -> None:
    bloque = _bloque_funcion()
    assert "select plan, trial_ends_at" in bloque, "no lee el plan y la prueba"
    assert "from public.profiles" in bloque
    assert "for update" in bloque, "debe bloquear el perfil para evitar carreras"
    assert "coalesce(v_plan, 'free') in ('pro', 'elite')" in bloque
    assert "v_trial is not null and v_trial > now()" in bloque, (
        "la prueba vigente debe contar como Pro"
    )


def test_cuenta_solo_las_posiciones_del_mismo_usuario() -> None:
    bloque = _bloque_funcion()
    assert "select count(*)::integer into v_count" in bloque
    assert "from public.user_holdings" in bloque
    assert "where user_id = new.user_id" in bloque
    assert "if v_count >= v_limit then" in bloque
    assert "raise exception" in bloque
    assert "límite de posiciones" in bloque


def test_service_role_no_cuenta_el_tope_y_solo_cada_usuario_inserta_lo_suyo() -> None:
    bloque = _bloque_funcion()
    assert "if auth.role() = 'service_role' then" in bloque
    assert "new.user_id is distinct from auth.uid()" in bloque, (
        "authenticated solo puede insertar en su propia cuenta"
    )


def test_trigger_solo_en_insert_de_user_holdings() -> None:
    sql = _activo()
    assert (
        "drop trigger if exists enforce_user_holdings_limit on public.user_holdings;"
        in sql
    ), "el trigger debe ser idempotente"
    assert "create trigger enforce_user_holdings_limit" in sql
    assert "before insert on public.user_holdings" in sql
    assert "for each row execute function public.enforce_user_holdings_limit();" in sql
    assert "before insert or update" not in sql, "la tarea pide solo INSERT"


def test_es_idempotente_y_no_toca_datos_existentes() -> None:
    sql = _activo()
    assert "create or replace function public.enforce_user_holdings_limit()" in sql
    assert "update public.user_holdings" not in sql, "no debe reescribir posiciones"
    assert "delete from public.user_holdings" not in sql
    assert "Depende de la 050" in sql, "debe documentar la dependencia de F58"


def test_rollback_comentado_y_completo() -> None:
    sql = _sql()
    rollback = sql[sql.find("-- ROLLBACK") :]
    assert (
        "-- drop trigger if exists enforce_user_holdings_limit "
        "on public.user_holdings;" in rollback
    )
    assert "-- drop function if exists public.enforce_user_holdings_limit();" in rollback


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
