"""
Clasificación de símbolos de holdings para precios (D35).

Cada símbolo sin precio cae en una clase con su arreglo:
  efectivo        caja / monedas / money market        -> se omite (no cuenta como faltante)
  bono            bonos, notas, letras, % y vencimiento -> se omite
  opcion          opciones (OCC, CALL/PUT con strike)   -> se omite
  derecho         warrants, derechos, units              -> se omite
  cusip           CUSIP de 9 caracteres                  -> OpenFIGI (ticker_map.resolve_cusips)
  nombre_emisor   nombre en vez de ticker                -> búsqueda Yahoo con nombre limpio
  bolsa_extranjera bolsa no EE.UU. sin sufijo            -> sufijo Yahoo por bolsa
  ticker_raro     preferentes, sufijos raros             -> mapa manual verificado
  ticker          ticker normal                          -> Yahoo directo (o deslistado)
"""

from __future__ import annotations

import re

SKIP_CLASSES = frozenset({"efectivo", "bono", "opcion", "derecho", "prediccion"})

# D37: mercados de Polymarket (slug en minusculas con guiones): no son acciones.
_PREDICTION_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+){2,}$")

_CASH_WORDS = ("CASH", "MONEY MARKET", "MMF", "LIQUIDITY", "SWEEP", "COLLATERAL",
               "MARGIN", "FUTURES", "FX FORWARD", "CURRENCY", "DEPOSIT")
_CURRENCIES = {"USD", "EUR", "CLP", "CLF", "BRL", "MXN", "JPY", "GBP", "CHF", "CAD", "AUD",
               "CNY", "HKD", "KRW", "TWD", "ARS", "COP", "PEN", "UF", "SEK", "NOK", "DKK"}
_BOND_RE = re.compile(
    r"(\d+(\.\d+)?\s?%|\bNOTES?\b|\bBONDS?\b|\bBILLS?\b|\bDEBENTURE|\bTREASURY\b|\bT-BILL|"
    r"\bSR\b.*\bDUE\b|\bDUE\s+\d|\b\d{1,2}/\d{1,2}/\d{2,4}\b|\bCONV\b|\bFRN\b|\bMTN\b|\bBTU\b|\bBCU\b|\bBTP\b)"
)
_OCC_RE = re.compile(r"^[A-Z]{1,6}\s?\d{6}[CP]\d{8}$")
_OPTION_RE = re.compile(r"\b(CALL|PUT)\b.*\d|\d.*\b(CALL|PUT)\b")
_RIGHT_RE = re.compile(r"\b(WARRANTS?|WTS?|RIGHTS?|RTS|UNITS?)\b|[-.](WS|WT|RT|U)$|/(WS|U|RT)$")
_CUSIP_RE = re.compile(r"^[0-9A-Z]{8}[0-9]$")
_PLAIN_TICKER = re.compile(r"^[A-Z]{1,5}(-[A-Z])?$")
_PREFERRED_RE = re.compile(r"^[A-Z]{1,5}([-.]P[-.]?[A-Z]?|-PR[A-Z]?|\.PR\.?[A-Z]?|\s?PR[A-Z])$")

# Bolsa (como viene en holdings) -> sufijo Yahoo. Verificado contra el
# formato de Yahoo (ej. VOD.L, SAP.DE, MC.PA, NESN.SW, SHOP.TO, BHP.AX).
EXCHANGE_SUFFIX = {
    "LSE": ".L", "LON": ".L", "XLON": ".L", "LN": ".L",
    "XETRA": ".DE", "XETR": ".DE", "ETR": ".DE", "GY": ".DE", "FRA": ".F", "FWB": ".F",
    "EPA": ".PA", "XPAR": ".PA", "PAR": ".PA", "FP": ".PA", "EURONEXT PARIS": ".PA",
    "AMS": ".AS", "XAMS": ".AS", "NA": ".AS", "EURONEXT AMSTERDAM": ".AS",
    "EBR": ".BR", "XBRU": ".BR", "BB": ".BR",
    "BIT": ".MI", "XMIL": ".MI", "MIL": ".MI", "IM": ".MI",
    "BME": ".MC", "XMAD": ".MC", "MCE": ".MC", "SM": ".MC",
    "SIX": ".SW", "XSWX": ".SW", "SWX": ".SW", "VTX": ".SW", "SW": ".SW",
    "STO": ".ST", "XSTO": ".ST", "SS_SE": ".ST", "OSL": ".OL", "XOSL": ".OL",
    "CPH": ".CO", "XCSE": ".CO", "HEL": ".HE", "XHEL": ".HE",
    "TSX": ".TO", "TSE_CA": ".TO", "XTSE": ".TO", "CN": ".TO", "TSXV": ".V", "CVE": ".V",
    "ASX": ".AX", "XASX": ".AX", "AU": ".AX",
    "NSE": ".NS", "XNSE": ".NS", "BSE": ".BO",
    "JSE": ".JO", "TASE": ".TA", "SGX": ".SI", "BMV": ".MX", "BCBA": ".BA", "BVL": ".LM",
    "BVC": ".CL", "WSE": ".WA", "VIE": ".VI", "ISE": ".IR", "LIS": ".LS",
}
US_EXCHANGES = {"NYSE", "NASDAQ", "NYQ", "NMS", "NGM", "NCM", "ARCA", "NYSEARCA", "AMEX",
                "BATS", "CBOE", "US", "OTC", "OTCMKTS", "PNK"}
CHILE_EXCHANGES = {"BCS", "SSE", "SN", "SANTIAGO"}


def classify(symbol: str, exchange: str | None = None, currency: str | None = None,
             asset_class: str | None = None, name: str | None = None) -> str:
    raw = (symbol or "").strip()
    up = raw.upper()
    text = f"{up} {(name or '').upper()}"
    ac = (asset_class or "").lower()
    ex = (exchange or "").strip().upper()
    if ac == "cash" or up in _CURRENCIES or up.endswith("-CASH") or any(w in up for w in _CASH_WORDS):
        return "efectivo"
    if ac == "bond" or ((" " in up or "%" in up) and _BOND_RE.search(up)):
        return "bono"
    if _OCC_RE.match(up) or _OPTION_RE.search(text if " " in up else up):
        return "opcion"
    if _RIGHT_RE.search(up):
        return "derecho"
    if _CUSIP_RE.match(up) and any(c.isdigit() for c in up[:8]):
        return "cusip"
    if _PREDICTION_RE.match(raw) or ac in ("prediction", "prediccion", "polymarket"):
        return "prediccion"
    if " " in raw or raw != up or len(raw) > 12:
        return "nombre_emisor"
    if ex and ex not in US_EXCHANGES and ex not in CHILE_EXCHANGES and "." not in up and ex in EXCHANGE_SUFFIX:
        return "bolsa_extranjera"
    if _PREFERRED_RE.match(up) or not re.fullmatch(r"[A-Z0-9][A-Z0-9.\-/*]{0,11}", up):
        return "ticker_raro"
    return "ticker"


def is_skip(cls: str) -> bool:
    return cls in SKIP_CLASSES


def suffix_for_exchange(symbol: str, exchange: str | None) -> str:
    """Ticker Yahoo para una bolsa extranjera; "" si la bolsa no está mapeada."""
    suf = EXCHANGE_SUFFIX.get((exchange or "").strip().upper())
    if not suf:
        return ""
    base = symbol.strip().upper().replace("/", "-")
    if suf == ".L":
        base = base.replace(".", "")  # BT.A -> BTA.L (Yahoo LSE sin punto)
    else:
        base = base.replace(".", "-")
    return base + suf


_CLASS_TAIL = re.compile(r"\b(CL(ASS)?|SER(IES)?|SHS)\s+[A-Z]\b|\bSPONSORED\b|\bSPON\b|\bADR\b|\bADS\b|"
                         r"\bORD(INARY)?\b|\bREG(ISTERED)?\b|\bNON[- ]?VTG\b|\bCOM(MON)?\b|\bSTK\b|\bPAR\b.*$|"
                         r"\b(INC|CORP|CORPORATION|CO|LTD|LIMITED|PLC|LLC|LP|NV|SA|AG|SE|DEL|NEW|THE|HLDGS?|HOLDINGS?)\b\.?")


def clean_issuer_query(name: str) -> str:
    """'ALPHABET INC CL A' -> 'ALPHABET'; 'TAIWAN SEMICONDUCTOR MFG LTD SPONSORED ADR' -> 'TAIWAN SEMICONDUCTOR MFG'."""
    text = re.sub(r"[^A-Z0-9&' ]", " ", (name or "").upper())
    text = _CLASS_TAIL.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or (name or "").strip()
