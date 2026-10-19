"""
Superintendencia de Pensiones — acciones chilenas de AFP Modelo (Cuadro 14).

Modo A (httpx, el que corre `run_all`): el endpoint antiguo sin cifrar,
vigente hasta mayo de 2026.

    https://www.spensiones.cl/apps/carteras/genera_desagregada_xsl.php
        ?fecpro=AAAAMM&idu=50&listado=14

Prueba el mes en curso y camina hacia atrás hasta una respuesta de más
de 1000 bytes que contenga "CUADRO" y tenga filas. Desde junio de 2026
ese endpoint responde vacío (0 o ~363 bytes).

Modo B (`--navegador`): Playwright abre el portal del mes y sigue el
enlace "Html" del cuadro de Total de Fondos. Si falla, se anota un
`scraper_error` y se sigue con el modo A. El consolidado no se escribe:
falta verlo en vivo. El portafolio `afp-consenso-chile` (demo de la 006)
no se toca.

Peso = MMUS$ del emisor / total de la cartera × 100.
No se guarda ningún código CUSIP: solo el nemotécnico y el emisor.

`previous_weight` queda listo para detect-changes:
  - emisor nuevo → 0 → new_trade
  - |delta| ≥ 1 punto → peso anterior → weight_change
  - cambio menor → previous_weight = peso nuevo (delta 0), para que el
    umbral global de 0.5 pp no dispare una alerta.

detect-changes copia `source_url` al payload de AFP Modelo (la misma
URL del cuadro 14 que arma `payload_alerta()`). La de `scraper_error`
ya la guarda esta etapa.
"""

from __future__ import annotations

import html as html_lib
import re
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Callable
from urllib.parse import urljoin

import httpx

from base import Holding, SourceAdapter, get_db, log

PORTFOLIO_SLUG = "afp-modelo-acciones-cl"
IDU_AFP_MODELO = "50"
LISTADO_CUADRO_14 = "14"
UMBRAL_PP = 1.0
MAX_MESES = 18
MIN_BYTES = 1000

_CUADRO = (
    "https://www.spensiones.cl/apps/carteras/genera_desagregada_xsl.php"
)
_PORTAL = "https://www.spensiones.cl/apps/loadCarteras/loadCarInv.php"

# CUSIP: 8 caracteres + dígito verificador, y al menos un dígito.
# Así no se confunde con un nemotécnico de 9 letras (MALLPLAZA).
_CUSIP_RE = re.compile(r"^[0-9A-Z]{8}[0-9]$")
_CUSIP_TOKEN_RE = re.compile(r"\b[0-9A-Z]{8}[0-9]\b")
_TR_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S | re.I)
_TD_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.S | re.I)
_TAG_RE = re.compile(r"<[^>]+>")
_FECHA_RE = re.compile(r"Al (\d{2}-\d{2}-\d{4})")


def url_cuadro14(fecpro: str) -> str:
    return (
        f"{_CUADRO}?fecpro={fecpro}&idu={IDU_AFP_MODELO}&listado={LISTADO_CUADRO_14}"
    )


def url_portal(periodo: str) -> str:
    return (
        f"{_PORTAL}?ext=.php&menu=sci&menuN1=estfinfp&menuN2=NOID"
        f"&orden=10&periodo={periodo}"
    )


def es_cusip(valor: str) -> bool:
    token = re.sub(r"\s+", "", valor.upper())
    return bool(_CUSIP_RE.fullmatch(token) and any(c.isdigit() for c in token))


def limpiar_nemo(valor: str) -> str:
    """Quita el relleno de espacios duros y el mojibake 'Â' del HTML latin-1."""
    texto = valor.replace("\xa0", " ").replace("Â", "")
    texto = re.sub(r"\s+", " ", texto).strip()
    return texto


def limpiar_emisor(valor: str) -> str:
    texto = valor.replace("\xa0", " ").replace("Â", "")
    texto = _CUSIP_TOKEN_RE.sub(
        lambda m: "" if any(c.isdigit() for c in m.group(0)) else m.group(0),
        texto,
    )
    return re.sub(r"\s+", " ", texto).strip(" -")


def parse_cl_num(valor: str) -> float:
    """Número chileno: miles con punto y decimal con coma."""
    texto = valor.replace("\xa0", "").replace(" ", "").strip()
    if not texto or texto in {"-", "–", "—"}:
        raise ValueError(valor)
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    return float(texto)


def _celdas(tr: str) -> list[str]:
    celdas = []
    for cruda in _TD_RE.findall(tr):
        texto = _TAG_RE.sub("", cruda)
        texto = html_lib.unescape(texto).replace("\xa0", " ")
        celdas.append(re.sub(r"\s+", " ", texto).strip())
    return celdas


def parse_cuadro14(html: str) -> tuple[str | None, list[dict[str, Any]]]:
    """Parsea el Cuadro 14. Filas de 12 `<td>`; se omiten las que parten con TOTAL.

    Devuelve la fecha 'dd-mm-aaaa' (si viene en el HTML) y filas con
    nemo, emisor, tipo, total_mmusd, pct_fondo y pct_emisor.
    Nunca incluye un CUSIP.
    """
    encontrada = _FECHA_RE.search(html)
    fecha = encontrada.group(1) if encontrada else None
    filas: list[dict[str, Any]] = []
    for tr in _TR_RE.findall(html):
        celdas = _celdas(tr)
        if len(celdas) < 12 or not celdas[0] or not celdas[1]:
            continue
        if celdas[0].upper().startswith("TOTAL"):
            continue
        nemo = limpiar_nemo(celdas[0])
        if not nemo or nemo.upper().startswith("TOTAL") or es_cusip(nemo):
            continue
        emisor = limpiar_emisor(celdas[1])
        if not emisor or es_cusip(emisor):
            continue
        try:
            total = parse_cl_num(celdas[9])
            pct_fondo = parse_cl_num(celdas[10])
            pct_emisor = parse_cl_num(celdas[11])
        except ValueError:
            continue
        if total <= 0:
            continue
        filas.append(
            {
                "nemo": nemo,
                "emisor": emisor,
                "tipo": celdas[2],
                "total_mmusd": total,
                "pct_fondo": pct_fondo,
                "pct_emisor": pct_emisor,
            }
        )
    return fecha, filas


def respuesta_publicada(body: bytes | str) -> bool:
    """El mes está publicado si la respuesta trae más de 1000 bytes y dice CUADRO.

    Una página de 363 bytes (lo que devuelve el endpoint desde junio 2026)
    no está publicada, aunque mencione la palabra.
    """
    if isinstance(body, str):
        crudo = body.encode("latin-1", errors="replace")
        texto = body
    else:
        crudo = body
        texto = body.decode("latin-1", errors="replace")
    return len(crudo) > MIN_BYTES and "CUADRO" in texto.upper()


def iter_periodos(desde: date, max_meses: int = MAX_MESES) -> list[str]:
    """Meses AAAAMM desde `desde` hacia atrás, incluido el mes de `desde`."""
    cursor = desde.replace(day=1)
    periodos: list[str] = []
    for _ in range(max_meses):
        periodos.append(f"{cursor.year:04d}{cursor.month:02d}")
        cursor = (cursor.replace(day=1) - timedelta(days=1)).replace(day=1)
    return periodos


def buscar_periodo_publicado(
    leer: Callable[[str], bytes | str],
    desde: date,
    max_meses: int = MAX_MESES,
) -> str | None:
    """Primer AAAAMM, de reciente a antiguo, cuya respuesta está publicada."""
    for fecpro in iter_periodos(desde, max_meses):
        if respuesta_publicada(leer(fecpro)):
            return fecpro
    return None


def fecha_a_date(fecha: str | None, fecpro: str | None) -> date:
    if fecha:
        dia, mes, anio = fecha.split("-")
        return date(int(anio), int(mes), int(dia))
    if fecpro and len(fecpro) == 6 and fecpro.isdigit():
        anio, mes = int(fecpro[:4]), int(fecpro[4:])
        if mes == 12:
            return date(anio, 12, 31)
        return date(anio, mes + 1, 1) - timedelta(days=1)
    return date.today()


def peso_porcentual(mmusd: float, total: float | Decimal) -> float:
    base = total if isinstance(total, Decimal) else Decimal(str(total))
    valor = (Decimal(str(mmusd)) / base) * Decimal(100)
    return float(valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def previous_para_alerta(
    anterior: float | None,
    nuevo: float,
    umbral: float = UMBRAL_PP,
) -> tuple[float, str | None]:
    """(previous_weight, tipo) para que detect-changes clasifique el cambio.

    None o 0 → new_trade. |delta| ≥ umbral (1 pp) → weight_change.
    Un cambio más chico guarda previous_weight = peso nuevo: delta 0,
    y el umbral global de 0.5 pp no alcanza a disparar.
    """
    if anterior is None or anterior == 0:
        return 0.0, "new_trade"
    if abs(nuevo - anterior) >= umbral:
        return float(anterior), "weight_change"
    return float(nuevo), None


def payload_alerta(
    *,
    symbol: str,
    name: str,
    weight: float,
    previous_weight: float,
    source_url: str,
) -> dict[str, Any]:
    """Payload de alerta con la URL del cuadro. detect-changes todavía no la copia."""
    delta = round(weight - previous_weight, 2)
    if previous_weight == 0:
        tipo = "new_trade"
    elif weight == 0:
        tipo = "sold_trade"
    else:
        tipo = "weight_change"
    return {
        "type": tipo,
        "payload": {
            "symbol": symbol,
            "name": name,
            "weight": weight,
            "previous_weight": previous_weight,
            "delta": delta,
            "source_url": source_url,
        },
    }


def filas_a_holdings(
    filas: list[dict[str, Any]],
    fecha: str | None,
    fecpro: str | None,
) -> list[Holding]:
    """Agrupa por nemotécnico y pasa MMUS$ a peso. Sin CUSIP, sin TOTAL."""
    acumulado: dict[str, dict[str, Any]] = {}
    for fila in filas:
        nemo = limpiar_nemo(str(fila.get("nemo") or ""))
        emisor = limpiar_emisor(str(fila.get("emisor") or ""))
        if not nemo or nemo.upper().startswith("TOTAL") or es_cusip(nemo):
            continue
        if not emisor or es_cusip(emisor):
            continue
        try:
            mmusd = float(fila["total_mmusd"])
        except (KeyError, TypeError, ValueError):
            continue
        if mmusd <= 0:
            continue
        if nemo in acumulado:
            acumulado[nemo]["total_mmusd"] += mmusd
        else:
            acumulado[nemo] = {"nemo": nemo, "emisor": emisor, "total_mmusd": mmusd}

    total = sum(
        (Decimal(str(f["total_mmusd"])) for f in acumulado.values()),
        start=Decimal(0),
    )
    if total <= 0:
        return []

    corte = fecha_a_date(fecha, fecpro)
    holdings: list[Holding] = []
    for fila in acumulado.values():
        holdings.append(
            Holding(
                symbol=fila["nemo"],
                name=fila["emisor"],
                weight=peso_porcentual(fila["total_mmusd"], total),
                asset_class="equity",
                exchange="BCS",
                currency="CLP",
                as_of=corte,
            )
        )
    holdings.sort(key=lambda h: (-h.weight, h.symbol))
    return holdings


def _decode(body: bytes) -> str:
    return body.decode("latin-1", errors="replace")


def leer_cuerpo(client: httpx.Client, fecpro: str) -> bytes:
    url = url_cuadro14(fecpro)
    try:
        resp = client.get(url, headers={"Referer": url_portal(fecpro)}, timeout=45.0)
    except httpx.HTTPError as exc:
        log(f"[spensiones] {fecpro}: {exc}")
        return b""
    if resp.status_code != 200:
        log(f"[spensiones] {fecpro}: HTTP {resp.status_code} ({len(resp.content)} bytes)")
        return b""
    log(f"[spensiones] {fecpro}: {len(resp.content)} bytes")
    return resp.content


def buscar_cuadro14(
    client: httpx.Client,
    desde: date,
    max_meses: int = MAX_MESES,
) -> dict[str, Any] | None:
    """Modo A: el primer mes publicado que además parsea con filas."""
    for fecpro in iter_periodos(desde, max_meses):
        cuerpo = leer_cuerpo(client, fecpro)
        if not respuesta_publicada(cuerpo):
            continue
        fecha, filas = parse_cuadro14(_decode(cuerpo))
        if not filas:
            log(f"[spensiones] {fecpro}: trae CUADRO pero ninguna fila útil; sigo")
            continue
        return {
            "fecpro": fecpro,
            "fecha": fecha,
            "url": url_cuadro14(fecpro),
            "filas": filas,
        }
    return None


def fetch_html_navegador(periodos: list[str]) -> dict[str, Any]:
    """Abre el portal y sigue el Html de Total de Fondos. Lanza si no puede."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Playwright no está instalado; el modo navegador no puede correr."
        ) from exc

    ultimo_error = "sin periodos"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            for periodo in periodos:
                portal = url_portal(periodo)
                try:
                    page.goto(portal, wait_until="domcontentloaded", timeout=60000)
                except Exception as exc:  # noqa: BLE001 — el portal a veces no responde
                    ultimo_error = f"{periodo}: {exc}"
                    continue
                elegido = _elegir_enlace_html(page)
                if elegido is None:
                    ultimo_error = f"{periodo}: no hay enlace Html"
                    continue
                href = elegido.get_attribute("href")
                if not href:
                    ultimo_error = f"{periodo}: el enlace Html no tiene href"
                    continue
                destino = urljoin(portal, href)
                try:
                    resp = page.goto(destino, wait_until="domcontentloaded", timeout=60000)
                except Exception as exc:  # noqa: BLE001
                    ultimo_error = f"{periodo}: {exc}"
                    continue
                crudo = b""
                if resp is not None:
                    try:
                        crudo = resp.body()
                    except Exception:  # noqa: BLE001
                        crudo = b""
                html = page.content()
                if not respuesta_publicada(crudo) and not respuesta_publicada(html):
                    ultimo_error = (
                        f"{periodo}: el enlace Html devolvió {len(crudo)} bytes"
                    )
                    continue
                texto = html if respuesta_publicada(html) else _decode(crudo)
                fecha, filas = parse_cuadro14(texto)
                if not filas:
                    ultimo_error = f"{periodo}: HTML sin filas de cuadro"
                    continue
                return {
                    "fecpro": periodo,
                    "fecha": fecha,
                    "url": destino,
                    "filas": filas,
                    "universo": "total_fondos",
                }
        finally:
            browser.close()
    raise RuntimeError(ultimo_error)


def _elegir_enlace_html(page: Any) -> Any | None:
    links = page.locator("a")
    n = links.count()
    primero = None
    for i in range(n):
        link = links.nth(i)
        try:
            texto = (link.inner_text(timeout=2000) or "").strip()
        except Exception:  # noqa: BLE001
            continue
        if not re.search(r"html", texto, re.I):
            continue
        if primero is None:
            primero = link
        try:
            contexto = link.evaluate(
                """el => {
                    const tr = el.closest('tr');
                    return (tr ? tr.innerText : (el.parentElement && el.parentElement.innerText)) || '';
                }"""
            )
        except Exception:  # noqa: BLE001
            contexto = ""
        if re.search(r"Total de Fondos", contexto or "", re.I) and re.search(
            r"\b(11|14)\b", contexto or ""
        ):
            return link
    return primero


def fetch_modo_b(desde: date, max_meses: int = 4) -> dict[str, Any]:
    return fetch_html_navegador(iter_periodos(desde, max_meses))


def _pesos_anteriores(rows: list[dict[str, Any]], as_of: date) -> dict[str, float]:
    """Último peso de un corte anterior. Si no hay, no inventa uno."""
    corte = as_of.isoformat()
    mejor: dict[str, tuple[str, float]] = {}
    for row in rows:
        fecha = str(row.get("as_of") or "")
        if not fecha or fecha >= corte:
            continue
        symbol = str(row.get("symbol") or "")
        if not symbol:
            continue
        if symbol not in mejor or fecha > mejor[symbol][0]:
            mejor[symbol] = (fecha, float(row["weight"]))
    return {symbol: peso for symbol, (_, peso) in mejor.items()}


def _fila_mismo_corte(
    rows: list[dict[str, Any]], symbol: str, as_of: date
) -> dict[str, Any] | None:
    corte = as_of.isoformat()
    for row in rows:
        if str(row.get("symbol") or "") == symbol and str(row.get("as_of") or "") == corte:
            return row
    return None


class SpensionesAdapter(SourceAdapter):
    name = "spensiones"
    portfolio_slug = PORTFOLIO_SLUG

    def __init__(self, dry_run: bool = False, navegador: bool = False) -> None:
        super().__init__(dry_run=dry_run)
        self.navegador = navegador

    def fetch_raw(self) -> dict[str, Any]:
        modo_b = None
        browser_error = None
        if self.navegador:
            try:
                modo_b = fetch_modo_b(date.today())
                log(
                    f"[{self.name}] modo B: {modo_b['fecpro']} "
                    f"{len(modo_b['filas'])} filas (consolidado, no se escribe)"
                )
            except Exception as exc:  # noqa: BLE001 — el modo A es el respaldo
                browser_error = str(exc)
                log(f"[{self.name}] modo B falló ({browser_error}); sigo con el cuadro 14")

        hallado = buscar_cuadro14(self.client, date.today())
        if hallado is None:
            log(f"[{self.name}] ningún mes publicó el cuadro 14")
            return {
                "filas": [],
                "fecha": None,
                "fecpro": None,
                "url": None,
                "modo_b": modo_b,
                "browser_error": browser_error,
            }
        hallado["modo_b"] = modo_b
        hallado["browser_error"] = browser_error
        return hallado

    def normalize(self, raw: Any) -> list[Holding]:
        if not raw:
            return []
        return filas_a_holdings(
            list(raw.get("filas") or []),
            raw.get("fecha"),
            raw.get("fecpro"),
        )

    def run(self, db: Any | None = None) -> dict[str, Any]:
        if db is None and not self.dry_run:
            db = get_db()
        raw = self.fetch_raw()
        holdings = self.normalize(raw)
        source_url = raw.get("url")
        resumen: dict[str, Any] = {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "holdings": len(holdings),
            "fecpro": raw.get("fecpro"),
            "source_url": source_url,
            "as_of": holdings[0].as_of.isoformat() if holdings else None,
        }
        if raw.get("modo_b"):
            resumen["modo_b_filas"] = len(raw["modo_b"].get("filas") or [])
            resumen["modo_b_url"] = raw["modo_b"].get("url")
        if raw.get("browser_error"):
            resumen["scraper_error"] = raw["browser_error"]

        if not holdings:
            resumen["status"] = "empty"
            return resumen

        if self.dry_run:
            top = holdings[0]
            log(
                f"[{self.name}] DRY-RUN: {len(holdings)} holdings NO escritos "
                f"(portfolio {self.portfolio_slug}, top: {top.symbol} {top.weight}%, "
                f"fuente: {source_url})"
            )
            resumen["status"] = "ok"
            resumen["dry_run"] = True
            return resumen

        portfolio_id = self._resolve_portfolio_id(db)
        if raw.get("browser_error"):
            _registrar_scraper_error(
                db,
                portfolio_id,
                str(raw["browser_error"]),
                source_url or url_portal(date.today().strftime("%Y%m")),
            )

        existentes = (
            db.table("holdings")
            .select("id, symbol, weight, as_of")
            .eq("portfolio_id", portfolio_id)
            .execute()
        ).data or []
        anteriores = _pesos_anteriores(existentes, holdings[0].as_of)

        creados = 0
        actualizados = 0
        for h in holdings:
            misma = _fila_mismo_corte(existentes, h.symbol, h.as_of)
            if misma is not None and abs(float(misma["weight"]) - h.weight) < 0.01:
                continue
            base_anterior = anteriores.get(h.symbol)
            if base_anterior is None and misma is not None:
                base_anterior = float(misma["weight"])
            previo, _tipo = previous_para_alerta(base_anterior, h.weight)
            fila = {
                "portfolio_id": portfolio_id,
                "symbol": h.symbol,
                "name": h.name,
                "weight": h.weight,
                "previous_weight": previo,
                "asset_class": h.asset_class,
                "exchange": h.exchange,
                "currency": h.currency,
                "as_of": h.as_of.isoformat(),
            }
            db.table("holdings").upsert(
                fila, on_conflict="portfolio_id,symbol,as_of"
            ).execute()
            if misma is None and base_anterior is None:
                creados += 1
            else:
                actualizados += 1

        resumen["created"] = creados
        resumen["updated"] = actualizados
        resumen["status"] = "ok"
        return resumen


def _registrar_scraper_error(
    db: Any, portfolio_id: str, mensaje: str, source_url: str
) -> None:
    """Alerta interna. Queda sin publicar para no escribirle a los seguidores."""
    db.table("alerts").insert(
        {
            "portfolio_id": portfolio_id,
            "type": "scraper_error",
            "severity": "low",
            "title": "SP: el modo navegador falló; se usó el cuadro 14 antiguo",
            "payload": {
                "source": "spensiones",
                "source_url": source_url,
                "error": mensaje[:500],
            },
            "is_published": False,
        }
    ).execute()
    log("[spensiones] scraper_error registrado (is_published=false)")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Cuadro 14 de la Superintendencia de Pensiones → reclu.cl"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Descarga y parsea, sin escribir en Supabase",
    )
    parser.add_argument(
        "--navegador",
        action="store_true",
        help="Intentar el portal con Playwright antes del cuadro 14 antiguo",
    )
    args = parser.parse_args()

    adapter = SpensionesAdapter(dry_run=args.dry_run, navegador=args.navegador)
    result = adapter.run()
    log(f"[{adapter.name}] Result: {result}")
