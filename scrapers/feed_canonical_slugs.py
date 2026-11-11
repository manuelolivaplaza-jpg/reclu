"""Slugs canónicos del feed privado Maverlang (vía B).

Solo familias 13F y ETF. Los alias (desdoble D40 y hero) se listan en el
índice para redirigir, pero no se exporta un archivo por alias.
"""

from __future__ import annotations

from typing import Any

# coverage: full_13f | top50_of_full_book | issuer_etf

THIRTEEN_F: list[dict[str, Any]] = [
    {
        "slug": "berkshire-hathaway-13f",
        "aliases": ("berkshire-hathaway",),
        "name": "Berkshire Hathaway 13F",
        "manager": "Warren Buffett",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "scion-13f",
        "aliases": ("scion-asset-management",),
        "name": "Scion 13F",
        "manager": "Michael Burry",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": True,
        "lag_note": (
            "Cartera congelada: según la migración 063, el último 13F citado "
            "es del 3-11-2025 y Scion dejó de reportar. No es la cartera de hoy."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "pershing-square-13f",
        "aliases": ("pershing-square",),
        "name": "Pershing Square 13F",
        "manager": "Bill Ackman",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "appaloosa-13f",
        "aliases": ("appaloosa-lp",),
        "name": "Appaloosa 13F",
        "manager": "David Tepper",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "tiger-global-13f",
        "aliases": ("tiger-global",),
        "name": "Tiger Global 13F",
        "manager": "Chase Coleman",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "coatue-13f",
        "aliases": ("coatue-management",),
        "name": "Coatue 13F",
        "manager": "Philippe Laffont",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "duquesne-13f",
        "aliases": ("duquesne-family-office",),
        "name": "Duquesne 13F",
        "manager": "Stanley Druckenmiller",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "third-point-13f",
        "aliases": (),
        "name": "Third Point 13F",
        "manager": "Daniel Loeb",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "baupost-13f",
        "aliases": (),
        "name": "Baupost 13F",
        "manager": "Seth Klarman",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "viking-global-13f",
        "aliases": (),
        "name": "Viking Global 13F",
        "manager": "Andreas Halvorsen",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "tci-13f",
        "aliases": ("tci-fund",),
        "name": "TCI 13F",
        "manager": "Chris Hohn",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "pif-13f",
        "aliases": ("pif-saudi",),
        "name": "Public Investment Fund 13F",
        "manager": "Public Investment Fund",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "cevian-13f",
        "aliases": (),
        "name": "Cevian 13F",
        "manager": "Cevian Capital",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "egerton-13f",
        "aliases": (),
        "name": "Egerton 13F",
        "manager": "John Armitage",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "softbank-13f",
        "aliases": ("softbank-vision",),
        "name": "SoftBank 13F",
        "manager": "SoftBank Group",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "sb-advisers-13f",
        "aliases": (),
        "name": "SB Investment Advisers 13F",
        "manager": "SB Investment Advisers",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "mubadala-13f",
        "aliases": ("mubadala-sovereign",),
        "name": "Mubadala 13F",
        "manager": "Mubadala",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "lansdowne-13f",
        "aliases": (),
        "name": "Lansdowne 13F",
        "manager": "Lansdowne Partners",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "renaissance-13f",
        "aliases": ("renaissance-institutional",),
        "name": "Renaissance Technologies 13F",
        "manager": "Jim Simons",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja. Libro institucional, no Medallion."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "bridgewater-13f",
        "aliases": ("bridgewater-all-weather",),
        "name": "Bridgewater 13F",
        "manager": "Ray Dalio",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "soros-13f",
        "aliases": (),
        "name": "Soros 13F",
        "manager": "George Soros",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "dme-greenlight-13f",
        "aliases": (),
        "name": "Greenlight Capital (DME)",
        "manager": "David Einhorn",
        "country": "US",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "ako-13f",
        "aliases": (),
        "name": "AKO Capital",
        "manager": "AKO Capital",
        "country": "Global",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. El infotable no es estándar y el valor se reporta en miles de dólares."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "hhlr-13f",
        "aliases": (),
        "name": "HHLR Advisors",
        "manager": "HHLR Advisors",
        "country": "Global",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "temasek-13f",
        "aliases": (),
        "name": "Temasek Holdings (13F)",
        "manager": "Temasek",
        "country": "Global",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. Es la tajada listada en EE.UU., no el libro global completo."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "norges-bank-13f",
        "aliases": (),
        "name": "Norges Bank (13F)",
        "manager": "Norges Bank Investment Management",
        "country": "Global",
        "source": "sec_13f",
        "coverage": "top50_of_full_book",
        "is_frozen": False,
        "lag_note": (
            "Solo se publican las 50 posiciones de mayor valor. El peso de cada "
            "línea es su participación en el 13F completo, no en el corte. "
            "Por eso los pesos del recorte no suman 100. Hasta 45 días de atraso."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "snb-13f",
        "aliases": (),
        "name": "Swiss National Bank (13F)",
        "manager": "Swiss National Bank",
        "country": "Global",
        "source": "sec_13f",
        "coverage": "top50_of_full_book",
        "is_frozen": False,
        "lag_note": (
            "Solo se publican las 50 posiciones de mayor valor. El peso de cada "
            "línea es su participación en el 13F completo, no en el corte. "
            "Por eso los pesos del recorte no suman 100. Hasta 45 días de atraso."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "gates-foundation-13f",
        "aliases": (),
        "name": "Gates Foundation Trust (13F)",
        "manager": "Gates Foundation Trust",
        "country": "Global",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
    {
        "slug": "icahn-13f",
        "aliases": (),
        "name": "Carl Icahn (13F)",
        "manager": "Carl C. Icahn",
        "country": "Global",
        "source": "sec_13f",
        "coverage": "full_13f",
        "is_frozen": False,
        "lag_note": (
            "El 13F puede presentarse hasta 45 días después del cierre del "
            "trimestre. No incluye cortos, derivados ni caja."
        ),
        "license": "Dominio público (SEC EDGAR)",
        "attribution": "Fuente: SEC EDGAR, formulario 13F-HR. Tecnología de Fraccion.si.",
        "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
    },
]


def _etf(
    slug: str,
    name: str,
    manager: str,
    country: str,
    source: str,
    source_url: str,
    attribution: str,
) -> dict[str, Any]:
    return {
        "slug": slug,
        "aliases": (),
        "name": name,
        "manager": manager,
        "country": country,
        "source": source,
        "coverage": "issuer_etf",
        "is_frozen": False,
        "lag_note": (
            "Holdings publicados por el emisor. El peso es el oficial del archivo, "
            "no una canasta editorial de Fraccion."
        ),
        "license": "Revisar términos del emisor antes de un uso comercial.",
        "attribution": attribution,
        "source_url": source_url,
    }


ETFS: list[dict[str, Any]] = [
    _etf("arkk", "ARK Innovation", "Cathie Wood", "US", "ark_csv",
         "https://www.ark-funds.com/",
         "Fuente: archivo de holdings de ARK Invest. Tecnología de Fraccion.si."),
    _etf("arkg", "ARK Genomic Revolution", "Cathie Wood", "US", "ark_csv",
         "https://www.ark-funds.com/",
         "Fuente: archivo de holdings de ARK Invest. Tecnología de Fraccion.si."),
    _etf("arkw", "ARK Next Generation Internet", "Cathie Wood", "US", "ark_csv",
         "https://www.ark-funds.com/",
         "Fuente: archivo de holdings de ARK Invest. Tecnología de Fraccion.si."),
    _etf("arkq", "ARK Autonomous Tech & Robotics", "Cathie Wood", "US", "ark_csv",
         "https://www.ark-funds.com/",
         "Fuente: archivo de holdings de ARK Invest. Tecnología de Fraccion.si."),
    _etf("arkf", "ARK Fintech Innovation", "Cathie Wood", "US", "ark_csv",
         "https://www.ark-funds.com/",
         "Fuente: archivo de holdings de ARK Invest. Tecnología de Fraccion.si."),
    _etf("copx", "Copper Miners (COPX)", "Global X", "Global", "globalx_csv",
         "https://www.globalxetfs.com/",
         "Fuente: archivo de holdings de Global X. Tecnología de Fraccion.si."),
    _etf("lit", "Lithium & Battery (LIT)", "Global X", "Global", "globalx_csv",
         "https://www.globalxetfs.com/",
         "Fuente: archivo de holdings de Global X. Tecnología de Fraccion.si."),
    _etf("bug", "Cybersecurity (BUG)", "Global X", "US", "globalx_csv",
         "https://www.globalxetfs.com/",
         "Fuente: archivo de holdings de Global X. Tecnología de Fraccion.si."),
    _etf("hero", "Video Games & Esports (HERO)", "Global X", "US", "globalx_csv",
         "https://www.globalxetfs.com/",
         "Fuente: archivo de holdings de Global X. Tecnología de Fraccion.si."),
    _etf("ech", "iShares MSCI Chile ETF (ECH)", "BlackRock/iShares", "CL", "ishares_csv",
         "https://www.ishares.com/",
         "Fuente: latest-holdings de iShares (BlackRock). Tecnología de Fraccion.si."),
    _etf("eww", "iShares MSCI Mexico ETF (EWW)", "BlackRock/iShares", "US", "ishares_csv",
         "https://www.ishares.com/",
         "Fuente: latest-holdings de iShares (BlackRock). Tecnología de Fraccion.si."),
    _etf("ewz", "iShares MSCI Brazil ETF (EWZ)", "BlackRock/iShares", "US", "ishares_csv",
         "https://www.ishares.com/",
         "Fuente: latest-holdings de iShares (BlackRock). Tecnología de Fraccion.si."),
    _etf("ibit", "iShares Bitcoin Trust (IBIT)", "BlackRock/iShares", "US", "ishares_csv",
         "https://www.ishares.com/",
         "Fuente: latest-holdings de iShares (BlackRock). Tecnología de Fraccion.si."),
    _etf("smh", "VanEck Semiconductor ETF (SMH)", "VanEck", "US", "vaneck_xlsx",
         "https://www.vaneck.com/",
         "Fuente: archivo de holdings de VanEck. Tecnología de Fraccion.si."),
]


def _with_family(rows: list[dict[str, Any]], family: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        item["family"] = family
        item["aliases"] = tuple(item.get("aliases") or ())
        out.append(item)
    return out


FEED_ENTRIES: list[dict[str, Any]] = (
    _with_family(THIRTEEN_F, "13f") + _with_family(ETFS, "etf")
)

CANONICAL_BY_SLUG: dict[str, dict[str, Any]] = {
    entry["slug"]: entry for entry in FEED_ENTRIES
}

ALIAS_TO_CANONICAL: dict[str, str] = {}
for entry in FEED_ENTRIES:
    for alias in entry["aliases"]:
        ALIAS_TO_CANONICAL[alias] = entry["slug"]

# Familias que este feed no exporta (documentado para los tests).
EXCLUDED_FAMILIES = frozenset({
    "broker_cl",
    "afp",
    "thematic",
    "political_us",
    "signal",
    "oge",
    "ptr",
})


def resolve_canonical(slug: str) -> str | None:
    """Devuelve el slug canónico o None si no entra en el feed."""
    if slug in CANONICAL_BY_SLUG:
        return slug
    return ALIAS_TO_CANONICAL.get(slug)


def is_exportable_slug(slug: str) -> bool:
    return slug in CANONICAL_BY_SLUG


def entry_for(slug: str) -> dict[str, Any] | None:
    canonical = resolve_canonical(slug)
    if not canonical:
        return None
    return CANONICAL_BY_SLUG[canonical]
