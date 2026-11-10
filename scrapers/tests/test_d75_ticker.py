"""D75: best_quote/resolve_issuer nunca devuelven un futuro (=F), un índice
(^XXX) ni un listado extranjero secundario (.F, .DU, .SG... 0XXX.L) cuando
existe el listado de EE.UU. Visto en staging: Delta -> 0QZ4.L, Eli Lilly ->
SLLY0=F, Teva -> TEVA.F, Global X -> ^HERO.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import name_resolution as nr  # noqa: E402


def Q(sym, name, exch="NMS", t="EQUITY"):
    return {"symbol": sym, "longname": name, "shortname": name, "exchange": exch, "quoteType": t}


def search(*quotes):
    """search(query) falso: todas las búsquedas devuelven los mismos quotes."""
    return lambda _q: list(quotes)


def test_delta_gana_el_listado_de_eeuu_aunque_el_extranjero_tenga_mejor_score():
    # Yahoo devuelve las dos líneas con el mismo nombre; el nombre corto de la
    # de EE.UU. da peor score (0.67 vs 1.0) y aun así debe ganar.
    quotes = [
        Q("DAL.MX", "Delta Air Lines, Inc.", "MEX"),
        Q("DAL", "Delta Air", "NYQ"),
    ]
    assert nr.best_quote("DELTA AIR LINES INC", quotes, us_only=False)[0] == "DAL"
    assert nr.resolve_issuer("DELTA AIR LINES INC", search(*quotes))[0] == "DAL"


def test_delta_nunca_cae_en_la_linea_iob_de_londres():
    # 0QZ4.L es Delta en el segmento internacional de la LSE, no la acción.
    iob = Q("0QZ4.L", "Delta Air Lines, Inc.", "LSE")
    assert nr.best_quote("DELTA AIR LINES INC", [iob], us_only=False)[0] is None
    assert nr.resolve_issuer("DELTA AIR LINES INC", search(iob))[0] is None


def test_eli_lilly_no_es_un_futuro():
    # SLLY0=F es el futuro de Eli Lilly; Yahoo lo devuelve como si fuera la
    # acción (mismo nombre, exchange de EE.UU. y sin punto en el símbolo).
    futuro = Q("SLLY0=F", "Eli Lilly and Company")
    accion = Q("LLY", "Eli Lilly and Company", "NYQ")
    assert nr.best_quote("ELI LILLY & CO", [futuro], us_only=False)[0] is None
    assert nr.best_quote("ELI LILLY & CO", [futuro, accion], us_only=False)[0] == "LLY"
    assert nr.resolve_issuer("ELI LILLY & CO", search(futuro, accion))[0] == "LLY"


def test_teva_no_toma_frankfurt():
    frankfurt = Q("TEVA.F", "Teva Pharmaceutical Industries Limited", "FRA")
    accion = Q("TEVA", "Teva Pharmaceutical Industries Limited", "NYQ")
    assert nr.best_quote("TEVA PHARMACEUTICAL INDUSTRIES LTD", [frankfurt], us_only=False)[0] is None
    assert nr.best_quote("TEVA PHARMACEUTICAL INDUSTRIES LTD", [frankfurt, accion], us_only=False)[0] == "TEVA"
    assert nr.resolve_issuer("TEVA PHARMACEUTICAL INDUSTRIES LTD", search(frankfurt))[0] is None
    assert nr.resolve_issuer("TEVA PHARMACEUTICAL INDUSTRIES LTD", search(frankfurt, accion))[0] == "TEVA"
    # aunque Yahoo etiquete el listado de Frankfurt con un exchange de EE.UU.,
    # el sufijo .F manda: no es un ticker de precio.
    etiquetado_mal = Q("TEVA.F", "Teva Pharmaceutical Industries Limited", "NMS")
    assert nr.best_quote("TEVA PHARMACEUTICAL INDUSTRIES LTD", [etiquetado_mal])[0] is None
    assert nr.resolve_issuer("TEVA PHARMACEUTICAL INDUSTRIES LTD", search(etiquetado_mal))[0] is None


def test_global_x_etf_nunca_indice():
    indice = Q("^HERO", "Global X Uranium ETF", "NMS", t="ETF")
    etf = Q("URA", "Global X Uranium ETF", "PCX", t="ETF")
    assert nr.best_quote("GLOBAL X URANIUM ETF", [indice], us_only=False)[0] is None
    assert nr.resolve_issuer("GLOBAL X URANIUM ETF", search(indice))[0] is None
    assert nr.resolve_issuer("GLOBAL X URANIUM ETF", search(indice, etf))[0] == "URA"


def test_sufijos_secundarios_alemanes_rechazados():
    accion = Q("TEVA", "Teva Pharmaceutical Industries Limited", "NYQ")
    for sufijo in (".F", ".DU", ".SG", ".BE", ".MU", ".HM", ".HA", ".IL"):
        secundario = Q("TEVA" + sufijo, "Teva Pharmaceutical Industries Limited", "NMS")  # exchange engañoso
        assert nr.best_quote("TEVA PHARMACEUTICAL INDUSTRIES LTD", [secundario])[0] is None, sufijo
        assert nr.best_quote("TEVA PHARMACEUTICAL INDUSTRIES LTD", [secundario, accion], us_only=False)[0] == "TEVA", sufijo


def test_londres_normal_sigue_siendo_extranjero_valido():
    # .L sin el prefijo 0 de las líneas IOB se acepta como listado extranjero.
    assert nr.best_quote("VODAFONE GROUP PLC", [Q("VOD.L", "Vodafone Group Plc", "LSE")], us_only=False)[0] == "VOD.L"


def test_fallback_extranjero_nunca_futuro_ni_indice():
    basura = [Q("SLLY0=F", "Eli Lilly and Company", "CME"),
              Q("^HERO", "Global X Uranium ETF", "NMS"),
              Q("TEVA.F", "Teva Pharmaceutical Industries Limited", "FRA")]
    for nombre in ("ELI LILLY & CO", "GLOBAL X URANIUM ETF", "TEVA PHARMACEUTICAL INDUSTRIES LTD"):
        sym, _score, _how = nr.resolve_issuer(nombre, search(*basura), allow_foreign=True)
        assert sym is None or ("=F" not in sym and not sym.startswith("^")), nombre
        assert sym is None, f"{nombre} resolvió a {sym!r}"
    # sin conflicto, el extranjero legítimo se sigue resolviendo (allow_foreign).
    assert nr.resolve_issuer("ADYEN NV", search(Q("ADYEN.AS", "Adyen N.V.", "AMS")), allow_foreign=True)[0] == "ADYEN.AS"
    assert nr.resolve_issuer("ADYEN NV", search(Q("ADYEN.AS", "Adyen N.V.", "AMS")), allow_foreign=False)[0] is None
