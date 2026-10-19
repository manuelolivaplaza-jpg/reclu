"""Cliente HTTP para la CMF (cmfchile.cl), detras de un WAF.

La CMF bloqueo nuestras pruebas desde datacenter ("Web Page Blocked",
19-10-2026). Por eso el cliente:

  - usa `curl_cffi` con `impersonate="chrome"` (huella TLS de navegador);
  - manda `User-Agent` realista y `Accept-Language` es-CL;
  - limita a 1 solicitud por segundo;
  - reintenta con backoff exponencial ante errores de red o 5xx;
  - si la respuesta es la pagina de bloqueo, lanza `CmfBlocked`.

Verificado en vivo el 2026-10-19 desde IP residencial: el index y la grilla
`acc_dividendos1grid.php` responden por GET. Desde datacenter la respuesta es
`CmfBlocked`, asi que la etapa que lo use debe registrar `scraper_error` y
seguir (ver `scrapers/stages/cmf_dividendos.py`).

No usa el MCP de terceros mcp-cmf-chile.
"""

from __future__ import annotations

import time
from typing import Any, Mapping, Sequence
from urllib.parse import urlencode

BASE_URL = "https://www.cmfchile.cl"

# Mismo UA de Chrome que usa senate_disclosure (Akamai) mas firma del scraper.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 reclu-scraper/1.0"
)
ACCEPT_LANGUAGE = "es-CL,es;q=0.9,en;q=0.8"

# Una solicitud por segundo como maximo (cortesia con el origen).
MIN_INTERVAL_SECONDS = 1.0
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 2.0
DEFAULT_TIMEOUT = 30.0

# Marcas de la pagina de bloqueo del WAF. En minusculas.
BLOCK_MARKERS: tuple[str, ...] = (
    "web page blocked",
    "request rejected",
    "access denied",
    "you have been blocked",
    "the requested url was rejected",
)
# Estados que el WAF usa para bloquear.
BLOCK_STATUSES = frozenset({401, 403, 406, 451})

Params = Mapping[str, Any] | Sequence[tuple[str, Any]] | None


class CmfBlocked(RuntimeError):
    """La CMF respondio con la pagina de bloqueo del WAF."""

    def __init__(self, url: str, status: int | None = None, detail: str = "") -> None:
        self.url = url
        self.status = status
        self.detail = detail
        extra = f" (HTTP {status})" if status is not None else ""
        super().__init__(f"CMF bloqueo la solicitud a {url}{extra}{': ' + detail if detail else ''}")


def _is_blocked(status: int | None, body: str) -> bool:
    """True si `status`/`body` corresponden a la pagina de bloqueo del WAF."""
    if status in BLOCK_STATUSES:
        return True
    texto = (body or "").lower()
    return any(marker in texto for marker in BLOCK_MARKERS)


def _as_text(content: Any) -> str:
    if isinstance(content, bytes):
        return content.decode("utf-8", errors="replace")
    return str(content)


class CmfClient:
    """Cliente con impersonate de Chrome, backoff y 1 req/s."""

    def __init__(
        self,
        *,
        min_interval: float = MIN_INTERVAL_SECONDS,
        max_retries: int = MAX_RETRIES,
        timeout: float = DEFAULT_TIMEOUT,
        user_agent: str = USER_AGENT,
        sleep: Any = time.sleep,
    ) -> None:
        self.min_interval = max(0.0, float(min_interval))
        self.max_retries = max(0, int(max_retries))
        self.timeout = float(timeout)
        self.user_agent = user_agent
        self._sleep = sleep
        self._last_request = 0.0
        self._session: Any = None

    # -- Interno -----------------------------------------------------------

    def _get_session(self) -> Any:
        if self._session is not None:
            return self._session
        try:
            from curl_cffi import requests as curl_requests
        except ImportError as exc:  # pragma: no cover - depende del entorno
            raise RuntimeError(
                "cmf_client requiere curl_cffi (el WAF de la CMF bloquea httpx). "
                "Instala con: pip install curl_cffi"
            ) from exc
        self._session = curl_requests.Session(
            impersonate="chrome",
            timeout=self.timeout,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": ACCEPT_LANGUAGE,
            },
        )
        return self._session

    def _throttle(self) -> None:
        if self.min_interval <= 0:
            return
        transcurrido = time.monotonic() - self._last_request
        espera = self.min_interval - transcurrido
        if espera > 0:
            self._sleep(espera)

    def _backoff(self, intento: int) -> None:
        self._sleep(BACKOFF_BASE_SECONDS * (2 ** intento))

    # -- API ---------------------------------------------------------------

    def request(
        self,
        method: str,
        url: str,
        *,
        params: Params = None,
        data: Any = None,
        headers: Mapping[str, str] | None = None,
    ) -> str:
        """Hace la solicitud y devuelve el cuerpo como texto.

        Reintenta con backoff ante errores de red o 5xx. Si detecta la pagina
        de bloqueo del WAF, lanza `CmfBlocked` (no reintenta).
        """
        sesion = self._get_session()
        ultimo_error: Exception | None = None
        for intento in range(self.max_retries + 1):
            self._throttle()
            try:
                respuesta = sesion.request(
                    method.upper(),
                    url,
                    params=params,
                    data=data,
                    headers=dict(headers) if headers else None,
                )
                self._last_request = time.monotonic()
            except CmfBlocked:
                raise
            except Exception as exc:  # noqa: BLE001 - red/TLS/timeout
                self._last_request = time.monotonic()
                ultimo_error = exc
                if intento < self.max_retries:
                    self._backoff(intento)
                    continue
                raise

            status = getattr(respuesta, "status_code", None)
            cuerpo = _as_text(getattr(respuesta, "content", "") or getattr(respuesta, "text", ""))

            if _is_blocked(status, cuerpo):
                raise CmfBlocked(url, status, "pagina de bloqueo del WAF")

            if status is not None and (status >= 500 or status == 429):
                if intento < self.max_retries:
                    self._backoff(intento)
                    continue
                raise RuntimeError(f"CMF respondio HTTP {status} en {url}")

            if status is not None and status >= 400:
                raise RuntimeError(f"CMF respondio HTTP {status} en {url}")

            return cuerpo

        raise ultimo_error if ultimo_error else RuntimeError(f"CMF fallo en {url}")

    def get(
        self,
        url: str,
        params: Params = None,
        *,
        headers: Mapping[str, str] | None = None,
    ) -> str:
        """GET que devuelve texto. Lanza `CmfBlocked` si el WAF bloquea."""
        return self.request("GET", url, params=params, headers=headers)

    def post(
        self,
        url: str,
        data: Any = None,
        *,
        params: Params = None,
        headers: Mapping[str, str] | None = None,
    ) -> str:
        """POST que devuelve texto. La grilla de dividendos admite GET, pero
        los formularios de la CMF son POST; lo dejamos para tareas siguientes."""
        return self.request("POST", url, params=params, data=data, headers=headers)

    def close(self) -> None:
        if self._session is not None:
            try:
                self._session.close()
            except Exception:  # noqa: BLE001
                pass
            self._session = None

    def __enter__(self) -> "CmfClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()


_default_client: CmfClient | None = None


def get(url: str, params: Params = None, **kwargs: Any) -> str:
    """GET con un cliente por defecto (1 req/s entre llamadas)."""
    global _default_client
    if _default_client is None:
        _default_client = CmfClient()
    return _default_client.get(url, params=params, **kwargs)


def build_url(path: str, params: Params = None) -> str:
    """Arma una URL absoluta sobre `BASE_URL` (util para payloads/tests)."""
    base = path if path.startswith("http") else BASE_URL + ("" if path.startswith("/") else "/") + path
    if not params:
        return base
    return f"{base}?{urlencode(params, doseq=True)}"
