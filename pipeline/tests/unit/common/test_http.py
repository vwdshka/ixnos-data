from collections.abc import Callable

import httpx
import pytest

from ixnos_data_pipeline.common.http import RateLimitedClient, RetryPolicy, SourceHttpError


class FakeTime:
    def __init__(self) -> None:
        self.now = 1000.0
        self.sleeps: list[float] = []

    def clock(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def make_client(
    handler: Callable[[httpx.Request], httpx.Response],
    time: FakeTime,
    *,
    min_interval: float = 4.0,
    max_attempts: int = 4,
) -> RateLimitedClient:
    return RateLimitedClient(
        "https://example.test",
        min_interval=min_interval,
        timeout=5.0,
        user_agent="ixnos-data-test",
        retry=RetryPolicy(max_attempts=max_attempts, base_delay=2.0, max_delay=30.0),
        transport=httpx.MockTransport(handler),
        clock=time.clock,
        sleep=time.sleep,
        jitter=lambda: 0.0,
    )


def test_spaces_requests_by_min_interval() -> None:
    time = FakeTime()
    client = make_client(lambda _: httpx.Response(200, json={}), time)

    client.get_json("/a")
    time.now += 1.5
    client.get_json("/b")

    assert time.sleeps == [pytest.approx(2.5)]


def test_retries_429_with_backoff_then_succeeds() -> None:
    time = FakeTime()
    responses = iter([httpx.Response(429), httpx.Response(429), httpx.Response(200, json=[1])])
    client = make_client(lambda _: next(responses), time, min_interval=0)

    assert client.get_json("/x") == [1]
    # Base delay 2s doubling per attempt; with zero jitter only the fixed half is waited.
    assert time.sleeps == [1.0, 2.0]
    assert client.retries == 2


def test_honours_retry_after_header() -> None:
    time = FakeTime()
    responses = iter([httpx.Response(429, headers={"Retry-After": "7"}), httpx.Response(200)])
    client = make_client(lambda _: next(responses), time, min_interval=0)

    client.request("GET", "/x")

    assert time.sleeps == [7.0]


def test_retries_timeouts() -> None:
    time = FakeTime()
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.ReadTimeout("stalled", request=request)
        return httpx.Response(200, json={"ok": True})

    client = make_client(handler, time, min_interval=0)

    assert client.get_json("/x") == {"ok": True}
    assert calls == 2


def test_gives_up_after_max_attempts() -> None:
    time = FakeTime()
    client = make_client(lambda _: httpx.Response(503), time, min_interval=0, max_attempts=3)

    with pytest.raises(SourceHttpError, match="after 3 attempts"):
        client.get_json("/x")
    assert client.requests_sent == 3


def test_does_not_retry_client_errors() -> None:
    time = FakeTime()
    client = make_client(lambda _: httpx.Response(400), time, min_interval=0)

    with pytest.raises(SourceHttpError) as err:
        client.get_json("/x")
    assert err.value.status_code == 400
    assert client.requests_sent == 1
