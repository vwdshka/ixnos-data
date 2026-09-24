"""Throttled HTTP client with retries.

ΚΗΜΔΗΣ answers 429 if requests come a couple of seconds apart and sometimes just hangs, so
every call waits for its slot and retries with backoff.
"""

import logging
import random
import time
from collections.abc import Callable
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from types import TracebackType
from typing import Any, Self

import httpx

log = logging.getLogger(__name__)

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 6
    base_delay: float = 5.0
    max_delay: float = 120.0


class SourceHttpError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class RateLimitedClient:
    """Sends requests no faster than one per `min_interval` seconds and retries transient
    failures (timeouts, connection errors, 429 and 5xx) with capped exponential backoff."""

    def __init__(
        self,
        base_url: str,
        *,
        min_interval: float,
        timeout: float,
        user_agent: str,
        retry: RetryPolicy | None = None,
        transport: httpx.BaseTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        jitter: Callable[[], float] = random.random,
    ) -> None:
        self._http = httpx.Client(
            base_url=base_url,
            timeout=httpx.Timeout(timeout, connect=10.0),
            headers={"User-Agent": user_agent, "Accept": "application/json"},
            transport=transport,
        )
        self._min_interval = min_interval
        self._retry = retry or RetryPolicy()
        self._clock = clock
        self._sleep = sleep
        self._jitter = jitter
        self._last_sent: float | None = None
        self.requests_sent = 0
        self.retries = 0

    def get_json(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        return self.request("GET", path, params=params).json()

    def post_json(self, path: str, *, json: Any, params: dict[str, Any] | None = None) -> Any:
        return self.request("POST", path, params=params, json=json).json()

    def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        for attempt in range(1, self._retry.max_attempts + 1):
            self._wait_for_slot()
            self.requests_sent += 1
            try:
                response = self._http.request(method, path, **kwargs)
            except httpx.TransportError as exc:
                failure, retry_after = f"{type(exc).__name__}", None
            else:
                if response.status_code not in RETRYABLE_STATUS:
                    if response.is_error:
                        raise SourceHttpError(
                            f"{method} {path} returned {response.status_code}",
                            response.status_code,
                        )
                    return response
                failure = f"HTTP {response.status_code}"
                retry_after = _retry_after_seconds(response)

            if attempt == self._retry.max_attempts:
                raise SourceHttpError(f"{method} {path} failed after {attempt} attempts: {failure}")

            delay = retry_after if retry_after is not None else self._backoff(attempt)
            self.retries += 1
            log.warning(
                "%s %s: %s, retry %d/%d in %.1fs",
                method,
                path,
                failure,
                attempt,
                self._retry.max_attempts - 1,
                delay,
            )
            self._sleep(delay)

        raise AssertionError("unreachable")

    def _wait_for_slot(self) -> None:
        now = self._clock()
        if self._last_sent is not None:
            wait = self._last_sent + self._min_interval - now
            if wait > 0:
                self._sleep(wait)
                now += wait
        self._last_sent = now

    def _backoff(self, attempt: int) -> float:
        ceiling = min(self._retry.max_delay, self._retry.base_delay * 2.0 ** (attempt - 1))
        # Half fixed, half random: spreads retries out without ever retrying immediately.
        return ceiling / 2 + self._jitter() * ceiling / 2

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()


def _retry_after_seconds(response: httpx.Response) -> float | None:
    value = response.headers.get("Retry-After")
    if value is None:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        pass
    try:
        return max(0.0, parsedate_to_datetime(value).timestamp() - time.time())
    except (TypeError, ValueError):
        return None
