"""La migración 050 debe preparar "Mi portafolio" sin romper lo existente.

Lee `supabase/migrations/050_mi_portafolio.sql` como texto: sin Supabase,
sin red y sin base de datos. Correr:
  uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_migracion_050.py
(o directo: python tests/test_migracion_050.py).
"""

from __future__ import annotations

from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SQL_050 = RAIZ / "supabase" / "migrations" / "050_mi_portafolio.sql"


def _sql() -> str:
    assert SQL_050.is_file(), f"falta {SQL_050}"
    # Normaliza CRLF para que las aserciones multilinea valgan en cualquier
    # checkout (Windows con core.autocrlf).
    return SQL_050.read_text(encoding="utf-8").replace("\r\n", "\n")


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


def test_columnas_nuevas_de_user_holdings_son_idempotentes() -> None:
    sql = _activo()
    columnas = (
        "quantity numeric(20, 6)",
        "avg_cost numeric(20, 6)",
        "currency text not null default 'USD'",
        "market text",
        "broker text",
    )
    for columna in columnas:
        assert f"add column if not exists {columna}" in sql, (
            f"falta add column if not exists de {columna}"
        )
    # Reglas de validación de las columnas nuevas.
    assert "check (quantity is null or quantity >= 0)" in sql
    assert "check (avg_cost is null or avg_cost >= 0)" in sql
    assert "check (currency in ('USD', 'CLP'))" in sql
    assert "check (market is null or market in ('US', 'CL'))" in sql
    assert "char_length(broker) <= 60" in sql
    # weight se mantiene para no romper la alineación de /compare.
    assert "drop column if exists weight" not in sql


def test_source_admite_cartola_y_mantiene_el_nombre_del_constraint() -> None:
    sql = _activo()
    assert "drop constraint if exists user_holdings_source_check" in sql
    assert "add constraint user_holdings_source_check" in sql
    assert "check (source in ('csv', 'manual', 'cartola'))" in sql


def test_user_portfolio_settings_parte_apagada_y_con_consentimiento_nulo() -> None:
    sql = _activo()
    assert "create table if not exists public.user_portfolio_settings" in sql
    # PK del usuario y borrado en cascada con la cuenta.
    assert "user_id uuid primary key references auth.users(id) on delete cascade" in sql
    # Las alertas automáticas son opt-in: default false.
    assert "auto_alerts boolean not null default false" in sql
    # Umbral entre 0 y 1, con 0.5 por defecto.
    assert "min_relevance numeric(4, 3) not null default 0.5" in sql
    assert "check (min_relevance >= 0 and min_relevance <= 1)" in sql
    # Canal de aviso.
    assert "alert_channel text not null default 'email'" in sql
    assert "check (alert_channel in ('email', 'telegram', 'both'))" in sql
    # Sin fecha de consentimiento = todavía no consintió.
    assert "consent_at timestamptz" in sql
    # La versión del texto aceptado se guarda junto a la fecha (F75B).
    assert "consent_version text" in sql
    assert "created_at timestamptz not null default now()" in sql
    assert "updated_at timestamptz not null default now()" in sql


def test_consent_version_es_idempotente_y_obligatoria_con_consent_at() -> None:
    sql = _activo()
    # Se puede aplicar sobre una base que ya tenía la tabla de la 050.
    assert "add column if not exists consent_version text" in sql
    # Regla: no hay consentimiento acreditado sin versión del texto.
    assert (
        "drop constraint if exists user_portfolio_settings_consent_version_check"
        in sql
    )
    assert "user_portfolio_settings_consent_version_check" in sql
    assert "check (consent_at is null or consent_version is not null)" in sql


def test_rls_solo_para_el_dueno() -> None:
    sql = _activo()
    assert "alter table public.user_holdings enable row level security;" in sql
    assert "alter table public.user_portfolio_settings enable row level security;" in sql
    # La policy histórica de user_holdings se conserva.
    assert 'drop policy if exists "own holdings all" on public.user_holdings;' in sql
    assert 'create policy "own holdings all" on public.user_holdings' in sql
    # Cuatro operaciones para los ajustes, todas por auth.uid() = user_id.
    for accion in ("read", "insert", "update", "delete"):
        assert (
            f'drop policy if exists "own portfolio settings {accion}"' in sql
        ), f"la policy {accion} no es idempotente"
        assert (
            f'create policy "own portfolio settings {accion}"' in sql
        ), f"falta la policy {accion}"
    assert sql.count("auth.uid() = user_id") >= 6
    assert "using (true)" not in sql, "no puede haber lectura pública de carteras"


def test_revokes_y_grants() -> None:
    sql = _activo()
    # Anon no puede leer ni escribir carteras.
    assert "revoke all on table public.user_holdings from anon;" in sql
    assert "revoke all on table public.user_portfolio_settings from public, anon;" in sql
    # Los ajustes solo los maneja el usuario autenticado.
    assert (
        "grant select, insert, update, delete on table public.user_portfolio_settings "
        "to authenticated;" in sql
    )
    # La función de borrado no es llamable desde public ni anon.
    assert (
        "revoke all on function public.delete_my_portfolio() from public;" in sql
    )
    assert "revoke all on function public.delete_my_portfolio() from anon;" in sql
    assert (
        "grant execute on function public.delete_my_portfolio() to authenticated;" in sql
    )


def test_funcion_borrar_cartera_es_security_invoker_y_limpia_ambas_tablas() -> None:
    bloque = _bloque_funcion("delete_my_portfolio")
    cabecera = bloque[: bloque.find("as $$")]
    assert "security invoker" in cabecera, "delete_my_portfolio debe ser security invoker"
    assert "security definer" not in cabecera
    assert "set search_path = ''" in cabecera, "no fija search_path = ''"
    assert "returns integer" in cabecera
    assert "language plpgsql" in cabecera
    # Borra solo lo del usuario autenticado, en ambas tablas.
    assert "delete from public.user_holdings" in bloque
    assert "delete from public.user_portfolio_settings" in bloque
    assert bloque.count("where user_id = auth.uid()") == 2
    assert "get diagnostics" in bloque
    assert "return v_holdings + v_settings;" in bloque, (
        "debe devolver la cantidad de filas borradas"
    )


def test_sin_vistas_publicas_de_carteras() -> None:
    sql = _activo()
    assert "create view" not in sql
    assert "create or replace view" not in sql


def test_rollback_comentado_y_completo() -> None:
    sql = _sql()
    rollback = sql[sql.find("-- ROLLBACK") :]
    assert "drop function if exists public.delete_my_portfolio();" in rollback
    assert (
        "drop constraint if exists user_portfolio_settings_consent_version_check"
        in rollback
    )
    assert "drop column if exists consent_version" in rollback
    assert "drop table if exists public.user_portfolio_settings;" in rollback
    assert "drop column if exists quantity" in rollback
    assert "drop column if exists avg_cost" in rollback
    assert "drop column if exists currency" in rollback
    assert "drop column if exists market" in rollback
    assert "drop column if exists broker" in rollback
    assert "check (source in ('csv', 'manual'))" in rollback


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
