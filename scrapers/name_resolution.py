"""
Resolución de nombre de emisor -> ticker Yahoo con verificación de nombre (D37).

Problema visto en el dry-run de D35: "precio encontrado" no basta. Con la
búsqueda cruda, "SEA LTD" daba STX (Seagate) y "PDD HOLDINGS INC" daba KPDD.
Aquí un candidato solo se acepta si su nombre en Yahoo coincide con el
nombre del emisor (tokens significativos, con las abreviaturas de los 13F
expandidas: NATL -> NATIONAL, MGMT -> MANAGEMENT, MATLS -> MATERIALS...).

Funciones puras (sin red): expand_abbrev, name_tokens, name_score,
best_quote. `resolve_issuer` y `resolve_foreign_ticker` usan una función
`search(query) -> quotes` inyectable (Yahoo en producción, falsa en tests).

D75: best_quote descarta siempre futuros (=F), índices (^XXX), plazas
secundarias alemanas (.F, .DU, .SG, .BE, .MU, .HM, .HA, .IL) y líneas IOB de
Londres (0QZ4.L), y prefiere el listado de EE.UU. sobre el extranjero aunque
el extranjero tenga mejor score.
"""

from __future__ import annotations

import re
from typing import Callable, Iterable

# Abreviaturas típicas de los nombres de emisor en 13F / EDGAR.
ABBREV = {
    "NATL": "NATIONAL", "INTL": "INTERNATIONAL", "MGMT": "MANAGEMENT", "MATLS": "MATERIALS",
    "SYS": "SYSTEMS", "FINL": "FINANCIAL", "HLDG": "HOLDING", "HLDGS": "HOLDINGS",
    "TECHNOLOGIES": "TECHNOLOGY", "TECH": "TECHNOLOGY", "TECHS": "TECHNOLOGY",
    "PHARMACEUTICALS": "PHARMACEUTICAL", "PHARMA": "PHARMACEUTICAL", "PHARMACEUTICLS": "PHARMACEUTICAL",
    "COMMUNICATIONS": "COMMUNICATION", "COMMUNICATNS": "COMMUNICATION", "COMM": "COMMUNICATION",
    "SVCS": "SERVICES", "SVC": "SERVICE", "SVCS.": "SERVICES", "SERV": "SERVICES",
    "ENTMT": "ENTERTAINMENT", "ENTERTAINMT": "ENTERTAINMENT", "ENTERPRISES": "ENTERPRISE",
    "RY": "RAILWAY", "RR": "RAILROAD", "MFG": "MANUFACTURING", "MTRS": "MOTORS", "MTR": "MOTOR",
    "AUTOMOTIVE": "AUTO", "BANCORPORATION": "BANCORP", "BANCSHARES": "BANCSHARES",
    "BK": "BANK", "BKG": "BANKING", "CHEM": "CHEMICAL", "CHEMICALS": "CHEMICAL",
    "ELEC": "ELECTRIC", "ELECTR": "ELECTRIC", "ENERGY": "ENERGY", "ENGR": "ENGINEERING",
    "EXPL": "EXPLORATION", "PETE": "PETROLEUM", "PETE.": "PETROLEUM", "PPTYS": "PROPERTIES",
    "PPTY": "PROPERTY", "RLTY": "REALTY", "RES": "RESOURCES", "RESOURCE": "RESOURCES",
    "INDS": "INDUSTRIES", "IND": "INDUSTRIES", "INDUSTRIAL": "INDUSTRIAL", "INSTRS": "INSTRUMENTS",
    "LABS": "LABORATORIES", "LAB": "LABORATORIES", "MED": "MEDICAL", "MEDL": "MEDICAL",
    "HEALTHCARE": "HEALTH", "HLTH": "HEALTH", "HOSP": "HOSPITALITY", "INVT": "INVESTMENT",
    "INVTS": "INVESTMENTS", "INVS": "INVESTMENTS", "CAP": "CAPITAL", "CORPN": "CORPORATION",
    "SOLUTIONS": "SOLUTION", "SOLTNS": "SOLUTION", "SEMICONDUCTOR": "SEMICONDUCTOR",
    "SEMICONDUCTORS": "SEMICONDUCTOR", "SEMICONDUCTR": "SEMICONDUCTOR", "SOFTWR": "SOFTWARE",
    "NETWKS": "NETWORKS", "NETWORK": "NETWORKS", "AMER": "AMERICA", "AMERN": "AMERICAN",
    "AMERICAN": "AMERICAN", "GEN": "GENERAL", "GENL": "GENERAL", "DEV": "DEVELOPMENT",
    "DEVS": "DEVICES", "DYNAMICS": "DYNAMICS", "EQUIP": "EQUIPMENT", "EQUITIES": "EQUITY",
    "BROS": "BROTHERS", "BRANDS": "BRANDS", "STORES": "STORES", "STRS": "STORES",
    "WHSL": "WHOLESALE", "ACQUISITION": "ACQUISITION", "ACQ": "ACQUISITION", "AIRLS": "AIRLINES",
    "AIRL": "AIRLINES", "TR": "TRUST", "TRANSN": "TRANSPORTATION", "TRANSPRTN": "TRANSPORTATION",
    "UTILS": "UTILITIES", "WTR": "WATER", "PWR": "POWER", "GRP": "GROUP", "CTRS": "CENTERS",
    "CTR": "CENTER", "ADVANCED": "ADVANCED", "ADVNCD": "ADVANCED", "ASSOC": "ASSOCIATES",
    "AUTO": "AUTO", "SCIENTIFIC": "SCIENTIFIC", "SCIENCES": "SCIENCE", "SCI": "SCIENCE",
    "BIOSCIENCES": "BIOSCIENCE", "THERAPEUTICS": "THERAPEUTIC", "THERAPEUTCS": "THERAPEUTIC",
    "INFORMATION": "INFORMATION", "INFO": "INFORMATION", "DATA": "DATA", "DIGITAL": "DIGITAL",
    "ONLINE": "ONLINE", "MKTS": "MARKETS", "EXCH": "EXCHANGE", "MINING": "MINING", "MNG": "MINING",
    "METALS": "METAL", "MTLS": "METAL", "OIL": "OIL", "GAS": "GAS", "WIRELESS": "WIRELESS",
}

# Palabras que no identifican al emisor.
STOP = {
    "INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COMPANY", "COMPANIES", "LTD", "LIMITED",
    "LLC", "LP", "L", "P", "PLC", "SA", "S", "A", "AG", "NV", "N", "V", "SE", "AB", "ASA", "OYJ",
    "SPA", "BV", "DEL", "NEW", "THE", "OF", "AND", "CLASS", "CL", "COM", "COMMON", "STOCK", "STK",
    "SHS", "SHARES", "ORD", "ORDINARY", "ADR", "ADS", "SPONSORED", "SPON", "REIT", "HOLDING",
    "HOLDINGS", "GROUP", "FORMERLY", "PAR", "REG", "REGISTERED", "NON", "VTG", "VOTING", "B", "C",
    "DE", "LA", "Y", "TRUST", "FD", "FUND", "ETF", "INTERNATIONAL", "GLOBAL", "USD", "SER",
    "SERIES", "UNIT", "UNITS", "CV", "SAB", "TBK", "BHD", "KK", "PCL", "NA",
}

_US_EXCH = {"NYQ", "NMS", "NGM", "NCM", "ASE", "PCX", "BTS", "NYSE", "NASDAQ", "NAS"}


def expand_abbrev(name: str, expand: bool = True) -> str:
    up = (name or "").upper().replace("&", " AND ").replace(".", "")
    text = re.sub(r"[^A-Z0-9 ]", " ", up)
    toks = text.split()
    # "TRIP COM GROUP" (13F) == "Trip.com Group" (Yahoo): unir <palabra> COM.
    merged: list[str] = []
    for i, t in enumerate(toks):
        if t == "COM" and merged and i < len(toks) - 1 or (t == "COM" and merged and i == len(toks) - 1 and len(toks) == 2):
            merged[-1] += "COM"
            continue
        merged.append(t)
    # "W P CAREY" == "W. P. Carey": unir letras sueltas seguidas (WP).
    joined: list[str] = []
    run = False  # el ultimo token se formo solo con letras sueltas
    for t in merged:
        if len(t) == 1 and t.isalpha():
            if run:
                joined[-1] += t
            else:
                joined.append(t)
            run = True
            continue
        joined.append(t)
        run = False
    return " ".join(ABBREV.get(t, t) if expand else t for t in joined)


def name_tokens(name: str, expand: bool = True) -> list[str]:
    return [t for t in expand_abbrev(name, expand).split() if t not in STOP and len(t) >= 2]


def _tok_match(a: str, b: str) -> bool:
    if a == b:
        return True
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    # Prefijo solo si casi igual (NETEASE ~ NETEASECOM), no STAR ~ STARBUCKS.
    return len(short) >= 4 and long_.startswith(short) and len(long_) - len(short) <= 3


def name_score(issuer: str, quote_name: str, expand: bool = True) -> float:
    """Coincidencia 0..1: fracción de tokens del emisor presentes en el nombre
    de Yahoo, exigiendo que el PRIMER token del emisor esté (evita STX por SEA)."""
    a = name_tokens(issuer, expand)
    b = name_tokens(quote_name, expand)
    if not a or not b:
        return 0.0
    if not any(_tok_match(a[0], t) for t in b):
        return 0.0
    hits = sum(1 for t in a if any(_tok_match(t, u) for u in b))
    extra = sum(1 for u in b if not any(_tok_match(u, t) for t in a))
    return hits / (len(a) + 0.5 * extra)


def _quote_name(q: dict) -> str:
    return str(q.get("longname") or q.get("shortname") or "")


# Listados que Yahoo mezcla con la acción de EE.UU. y que no sirven como
# ticker de precio: plazas secundarias alemanas (Frankfurt .F, Düsseldorf
# .DU, Stuttgart .SG, Berlín .BE, Múnich .MU, Hamburgo .HM, Hannover .HA) y
# la línea internacional (.IL).
_UNPRICEABLE_SUFFIXES = (".F", ".DU", ".SG", ".BE", ".MU", ".HM", ".HA", ".IL")
# Línea IOB de Londres: código de 3-4 caracteres que empieza con 0 (0QZ4.L
# es Delta Air Lines en el segmento internacional de la LSE, no la acción).
_IOB_LSE = re.compile(r"^0[A-Z0-9]{2,}\.L$")


def _unpriceable(sym: str) -> bool:
    """True si el símbolo NUNCA sirve como ticker de precio: futuro (SLLY0=F),
    índice (^HERO), plaza secundaria alemana (TEVA.F, .DU, .SG...) o línea
    IOB de Londres (0QZ4.L)."""
    return (sym.startswith("^") or "=" in sym
            or sym.endswith(_UNPRICEABLE_SUFFIXES) or bool(_IOB_LSE.fullmatch(sym)))


def best_quote(issuer: str, quotes: Iterable[dict], us_only: bool = True,
               min_score: float = 0.5) -> tuple[str | None, float]:
    """Mejor quote por nombre. Descarta futuros, índices y listados
    extranjeros secundarios (_unpriceable). Si dos quotes coinciden por
    nombre gana SIEMPRE el listado de EE.UU., aunque el extranjero tenga
    mejor score (Delta: DAL, no 0QZ4.L; Eli Lilly: LLY, no SLLY0=F)."""
    us_best: tuple[float, float, str] | None = None
    foreign_best: tuple[float, float, str] | None = None
    for q in quotes or []:
        if not isinstance(q, dict):
            continue
        if str(q.get("quoteType") or "").upper() not in {"EQUITY", "ETF"}:
            continue
        sym = str(q.get("symbol") or "").strip().upper()
        if not sym or _unpriceable(sym):
            continue
        # .F/.DU/0XXX.L ya quedaron fuera: un símbolo sin punto, sin '=' y
        # sin '^' es un ticker de EE.UU. aunque Yahoo no informe el exchange.
        us = (str(q.get("exchange") or "").upper() in _US_EXCH
              or ("." not in sym and "=" not in sym and not sym.startswith("^")))
        if us_only and not us:
            continue
        if not us and not sym.endswith(FOREIGN_SUFFIXES):
            continue  # listados secundarios (.DU, .SG, .BA CEDEAR, .BK DR...) no
        names = (str(q.get("longname") or ""), str(q.get("shortname") or ""))
        score = max(name_score(issuer, n) for n in names)
        if score < min_score:
            continue
        # Desempate: coincidencia sin expandir (TETRA TECH -> Tetra Tech, no TETRA Technologies).
        raw = max(name_score(issuer, n, expand=False) for n in names)
        key = (score, raw, sym)
        if us:
            if us_best is None or key > us_best:
                us_best = key
        elif foreign_best is None or key > foreign_best:  # el extranjero nunca le gana al de EE.UU.
            foreign_best = key
    best = us_best or foreign_best
    return (best[2], best[0]) if best else (None, 0.0)


def queries_for(issuer: str) -> list[str]:
    exp = expand_abbrev(issuer)
    core = " ".join(t for t in exp.split() if t not in STOP)
    # Para buscar, "NETEASECOM" no sirve: se vuelve a "NETEASE".
    core_q = " ".join(t[:-3] if t.endswith("COM") and len(t) > 5 else t for t in core.split())
    out = []
    for q in (core_q, core, exp, issuer):
        q = q.strip()
        if q and q not in out:
            out.append(q)
    return out


_FUND_TRUST = re.compile(r"\bTRUST\s+(I|II|III|IV|V)\b|\bETF\s+(TR|TRUST|SERIES)\b|\bSERIES\s+TR|\bFUNDS?\s+TR|EXCHANGE\s+TRADED\s+F")


def resolve_issuer(issuer: str, search: Callable[[str], list[dict]],
                   min_score: float = 0.5, allow_foreign: bool = True) -> tuple[str | None, float, str]:
    """(ticker, score, query) o (None, 0, motivo). Prefiere EE.UU.; si no hay
    listado de EE.UU. que coincida, acepta el mejor extranjero (allow_foreign).
    Si TODAS las búsquedas fallan (red, 429) relanza el error para no
    cachear un "sin resultado" falso."""
    if _FUND_TRUST.search((issuer or "").upper()):
        return None, 0.0, "fideicomiso de ETFs: el nombre no identifica un fondo"
    seen: list[dict] = []
    errors: list[Exception] = []
    qs = queries_for(issuer)
    for q in qs:
        try:
            quotes = search(q)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)
            continue
        seen.extend(quotes or [])
        t, s = best_quote(issuer, quotes, us_only=True, min_score=min_score)
        if t:
            return t, s, q
    if errors and len(errors) == len(qs):
        raise errors[-1]
    if allow_foreign:
        t, s = best_quote(issuer, seen, us_only=False, min_score=max(min_score, 0.6))
        # best_quote ya descarta futuros/índices; el guardia es la última
        # barrera para que este camino nunca devuelva SLLY0=F ni ^HERO.
        if t and not _unpriceable(t):
            return t, s, "extranjero"
    return None, 0.0, "sin coincidencia de nombre"


FOREIGN_SUFFIXES = (".L", ".DE", ".PA", ".AS", ".MI", ".MC", ".SW", ".ST", ".OL", ".CO", ".HE",
                    ".BR", ".WA", ".TO", ".AX", ".HK", ".KS", ".KQ", ".T", ".SA", ".MX", ".SN",
                    ".TW", ".SS", ".SZ", ".NS", ".JO", ".IR", ".VI", ".LS", ".SI", ".TA")


def resolve_foreign_ticker(symbol: str, issuer_name: str, search: Callable[[str], list[dict]]
                           ) -> tuple[str | None, str]:
    """Ticker sin sufijo de una bolsa extranjera (BOL, ANTO, 006400...).
    Se busca por el nombre del emisor y se acepta el listado cuya base sea el
    mismo código, o el de mejor nombre si el código no aparece."""
    base = symbol.strip().upper().replace(".", "-")
    queries = [q for q in (issuer_name, symbol) if q]
    for q in queries:
        try:
            quotes = search(q)
        except Exception:  # noqa: BLE001
            continue
        for qt in quotes or []:
            sym = str(qt.get("symbol") or "").upper()
            if "." in sym and sym.split(".")[0].replace(".", "-") == base and sym.endswith(FOREIGN_SUFFIXES):
                if not issuer_name or issuer_name == symbol or name_score(issuer_name, _quote_name(qt)) >= 0.34:
                    return sym, f"código {base} en {sym.split('.')[-1]}"
    return None, "sin listado con ese código"
