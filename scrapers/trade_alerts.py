"""Alertas de compra y venta por email para portafolios seguidos (D31).

Compara los dos ultimos snapshots (as_of) de holdings de cada portafolio
seguido: un simbolo nuevo es una COMPRA y uno que desaparece es una VENTA.
Registra eventos (trade_alert_events) y avisa a los seguidores segun sus
preferencias (follow_alert_prefs; sin fila = compras y ventas activadas).

Seguridad:
  - --dry-run: solo lee; no escribe nada ni envia nada.
  - El envio real exige TRADE_ALERTS_SEND_ENABLED=true (apagado por
    defecto) y RESEND_API_KEY. Sin eso, las entregas quedan como 'dry_run'.

Uso (desde scrapers):
    python trade_alerts.py --dry-run
    python trade_alerts.py                 # registra eventos; email solo con el flag
    python trade_alerts.py --slugs pelosi-tracker --dry-run
"""

from __future__ import annotations

import argparse
import os
import time
from typing import Any, Callable

import httpx

RESEND_URL = "https://api.resend.com/emails"
PAGE = 500
SITE_URL = os.environ.get("NEXT_PUBLIC_SITE_URL", "https://reclu.cl").rstrip("/")


def send_enabled() -> bool:
    """El envio real solo con el valor exacto 'true'."""
    return os.environ.get("TRADE_ALERTS_SEND_ENABLED") == "true"


def _retry(call: Callable[[], Any], attempts: int = 4, sleep=time.sleep):
    for i in range(attempts):
        try:
            return call()
        except (httpx.TimeoutException, httpx.TransportError):
            if i == attempts - 1:
                raise
            sleep(2 ** i)
    raise RuntimeError("unreachable")


def _paged(make_query) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        batch = _retry(lambda a=start: make_query().range(a, a + PAGE - 1).execute()).data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            return rows
        start += PAGE


# ---- logica pura ----

def latest_two_snapshots(rows: list[dict]) -> tuple[str | None, dict[str, float], str | None, dict[str, float]]:
    """(as_of_actual, {simbolo: peso}, as_of_anterior, {simbolo: peso})."""
    by_date: dict[str, dict[str, float]] = {}
    for r in rows:
        d = str(r.get("as_of") or "")[:10]
        sym = str(r.get("symbol") or "").strip()
        if not d or not sym:
            continue
        by_date.setdefault(d, {})[sym] = float(r.get("weight") or 0)
    dates = sorted(by_date)
    if not dates:
        return None, {}, None, {}
    cur = dates[-1]
    prev = dates[-2] if len(dates) > 1 else None
    return cur, by_date[cur], prev, (by_date[prev] if prev else {})


def diff_snapshots(prev: dict[str, float], cur: dict[str, float], skip_cash: bool = True) -> list[dict]:
    """Compras (nuevo) y ventas (sale). Sin snapshot anterior no hay eventos."""
    if not prev:
        return []
    def ok(s: str) -> bool:
        return not (skip_cash and (s.upper().endswith("CASH") or s.upper() in {"USD", "CLP"}))
    events = [
        {"symbol": s, "action": "buy", "weight_before": None, "weight_after": cur[s]}
        for s in sorted(set(cur) - set(prev)) if ok(s)
    ]
    events += [
        {"symbol": s, "action": "sell", "weight_before": prev[s], "weight_after": None}
        for s in sorted(set(prev) - set(cur)) if ok(s)
    ]
    return events


def recipients_for(follows: list[dict], prefs: dict[str, dict], emails: dict[str, str], action: str) -> list[tuple[str, str]]:
    """[(user_id, email)] que quieren el aviso de esa accion."""
    key = "email_buys" if action == "buy" else "email_sells"
    out = []
    for f in follows:
        uid = f.get("user_id")
        if not uid or uid not in emails:
            continue
        if prefs.get(uid, {}).get(key, True) is False:
            continue
        out.append((uid, emails[uid]))
    return out


def render_email(portfolio_name: str, slug: str, events: list[dict]) -> tuple[str, str]:
    """(asunto, html) en espanol, sin recomendaciones."""
    buys = [e["symbol"] for e in events if e["action"] == "buy"]
    sells = [e["symbol"] for e in events if e["action"] == "sell"]
    parts = []
    if buys:
        parts.append(f"{len(buys)} compra{'s' if len(buys) != 1 else ''}")
    if sells:
        parts.append(f"{len(sells)} venta{'s' if len(sells) != 1 else ''}")
    subject = f"{portfolio_name}: {' y '.join(parts)} nuevas"
    li = "".join(f"<li><strong>Compra</strong> {s}</li>" for s in buys) + "".join(
        f"<li><strong>Venta</strong> {s}</li>" for s in sells)
    html = (
        f"<p>Detectamos cambios en <strong>{portfolio_name}</strong>:</p><ul>{li}</ul>"
        f'<p><a href="{SITE_URL}/portfolio/{slug}">Ver el portafolio</a></p>'
        "<p style=\"color:#666;font-size:12px\">Datos de fuentes publicas con su atraso propio. "
        "No es asesoria de inversion. Puedes cambiar estos avisos en Ajustes.</p>"
    )
    return subject, html


def send_email(to: str, subject: str, html: str, post=None) -> bool:
    """Envia por Resend SOLO si el flag esta encendido. Devuelve True si salio."""
    if not send_enabled():
        return False
    key = os.environ.get("RESEND_API_KEY", "")
    if not key:
        print("WARNING TRADE_ALERTS_SEND_ENABLED=true pero falta RESEND_API_KEY: no se envia")
        return False
    post = post or httpx.post
    resp = post(
        RESEND_URL,
        headers={"Authorization": f"Bearer {key}"},
        json={"from": os.environ.get("EMAIL_FROM", "reclu.cl <alertas@reclu.cl>"), "to": [to], "subject": subject, "html": html},
        timeout=20.0,
    )
    resp.raise_for_status()
    return True


# ---- job ----

def run(db, dry_run: bool, slugs: list[str] | None = None) -> dict[str, int]:
    stats = {"portfolios": 0, "events": 0, "emails": 0, "would_email": 0}
    follows = _paged(lambda: db.table("follows").select("user_id, portfolio_id"))
    by_portfolio: dict[str, list[dict]] = {}
    for f in follows:
        by_portfolio.setdefault(f["portfolio_id"], []).append(f)
    if not by_portfolio:
        print("Nadie sigue portafolios: nada que hacer")
        return stats
    ports = _paged(lambda: db.table("portfolios").select("id, slug, name").in_("id", list(by_portfolio)))
    if slugs:
        ports = [p for p in ports if p.get("slug") in set(slugs)]
    user_ids = sorted({f["user_id"] for f in follows})
    emails = {r["id"]: r["email"] for r in _paged(lambda: db.table("profiles").select("id, email").in_("id", user_ids)) if r.get("email")}
    try:
        prefs_rows = _paged(lambda: db.table("follow_alert_prefs").select("user_id, portfolio_id, email_buys, email_sells"))
    except Exception as exc:  # noqa: BLE001 - sin migracion 061: todos con defaults
        print(f"WARNING follow_alert_prefs no disponible ({type(exc).__name__}); se usan los defaults")
        prefs_rows = []
    for p in ports:
        pid = p["id"]
        rows = _paged(lambda: db.table("holdings").select("symbol, weight, as_of").eq("portfolio_id", pid).order("as_of", desc=True))
        cur_date, cur, prev_date, prev = latest_two_snapshots(rows)
        events = diff_snapshots(prev, cur)
        stats["portfolios"] += 1
        if not events:
            continue
        print(f"{p['slug']}: {len(events)} cambios {prev_date} -> {cur_date}: " + ", ".join(f"{e['action']} {e['symbol']}" for e in events[:15]))
        prefs = {r["user_id"]: r for r in prefs_rows if r.get("portfolio_id") == pid}
        stats["events"] += len(events)
        saved: list[dict] = []
        if not dry_run:
            payload = [{**e, "portfolio_id": pid, "as_of": cur_date, "prev_as_of": prev_date} for e in events]
            res = _retry(lambda: db.table("trade_alert_events").upsert(payload, on_conflict="portfolio_id,symbol,action,as_of").execute())
            saved = res.data or []
        # Un email por usuario y portafolio con sus compras/ventas filtradas.
        for uid, email in {u: e for u, e in recipients_for(by_portfolio.get(pid, []), prefs, emails, "buy") + recipients_for(by_portfolio.get(pid, []), prefs, emails, "sell")}.items():
            mine = [e for e in events if (uid, email) in recipients_for(by_portfolio[pid], prefs, emails, e["action"])]
            if not mine:
                continue
            subject, html = render_email(p.get("name") or p["slug"], p["slug"], mine)
            if dry_run or not send_enabled():
                stats["would_email"] += 1
                print(f"  [no enviado] {subject} -> usuario {uid[:8]}")
                status = "dry_run"
            else:
                try:
                    status = "sent" if send_email(email, subject, html) else "dry_run"
                    stats["emails"] += status == "sent"
                except Exception as exc:  # noqa: BLE001
                    print(f"  WARNING envio a usuario {uid[:8]}: {exc}")
                    status = "failed"
            if not dry_run and saved:
                ids = [s["id"] for s in saved if (s.get("symbol"), s.get("action")) in {(m["symbol"], m["action"]) for m in mine}]
                deliveries = [{"event_id": i, "user_id": uid, "status": status} for i in ids]
                if deliveries:
                    _retry(lambda: db.table("trade_alert_deliveries").upsert(deliveries, on_conflict="event_id,user_id", ignore_duplicates=True).execute())
    print(f"{stats['portfolios']} portafolios, {stats['events']} eventos, {stats['emails']} emails enviados, "
          f"{stats['would_email']} sin enviar (dry-run o flag apagado)")
    return stats


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="Alertas de compra/venta por email")
    parser.add_argument("--dry-run", action="store_true", help="Solo lee: no escribe ni envia")
    parser.add_argument("--slugs", nargs="*", default=None)
    args = parser.parse_args(argv)
    from base import get_db

    print(f"envio real: {'ENCENDIDO' if send_enabled() and not args.dry_run else 'apagado'}")
    run(get_db(), dry_run=args.dry_run, slugs=args.slugs)


if __name__ == "__main__":
    main()
