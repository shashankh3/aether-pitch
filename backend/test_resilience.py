"""
AETHER PITCH — Resilience, Circuit Breaker & Async Transport Tests.

Verifies Track 1 improvements (Pillar 3.1 & 3.2):
- CircuitBreaker state transitions (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)
- Fast-fail protection when external Azure service is down
- Async _achat execution with httpx.AsyncClient
- ContentSafetyClient.analyze_async
- Personalizer._azure_translate_async
"""
import asyncio
import time
from unittest.mock import AsyncMock, MagicMock

import requests

from agents.foundry_core import FoundryRouterBase
from circuit_breaker import CircuitBreaker, CircuitBreakerOpenError, CircuitState
from config import Settings
from content_safety import ContentSafetyClient
from stage_d_e_personalizer import Personalizer


def test_circuit_breaker_lifecycle():
    cb = CircuitBreaker(name="test_service", failure_threshold=3, recovery_timeout=0.2)
    assert cb.state == CircuitState.CLOSED
    assert cb.allow_request() is True

    # 1st failure
    cb.record_failure(ValueError("timeout 1"))
    assert cb.state == CircuitState.CLOSED

    # 2nd failure
    cb.record_failure(ValueError("timeout 2"))
    assert cb.state == CircuitState.CLOSED

    # 3rd failure -> trips to OPEN
    cb.record_failure(ValueError("timeout 3"))
    assert cb.state == CircuitState.OPEN
    assert cb.allow_request() is False

    # Guard raises CircuitBreakerOpenError
    try:
        cb.guard()
        assert False, "Should have raised CircuitBreakerOpenError"
    except CircuitBreakerOpenError as exc:
        assert exc.retry_after > 0
        assert "is OPEN" in str(exc)

    # Wait for recovery timeout -> transitions to HALF_OPEN
    time.sleep(0.25)
    assert cb.state == CircuitState.HALF_OPEN
    assert cb.allow_request() is True

    # Successful trial closes circuit
    cb.record_success()
    assert cb.state == CircuitState.CLOSED
    assert cb.allow_request() is True
    print("[PASS] CircuitBreaker lifecycle: CLOSED -> OPEN -> HALF_OPEN -> CLOSED")


def test_circuit_breaker_half_open_failure():
    cb = CircuitBreaker(name="test_retry", failure_threshold=2, recovery_timeout=0.1)
    cb.record_failure()
    cb.record_failure()
    assert cb.state == CircuitState.OPEN

    time.sleep(0.15)
    assert cb.state == CircuitState.HALF_OPEN

    # Failure during HALF_OPEN immediately trips back to OPEN
    cb.record_failure()
    assert cb.state == CircuitState.OPEN
    print("[PASS] CircuitBreaker half-open failure: trips back to OPEN")


def test_foundry_router_circuit_breaker_telemetry():
    router = FoundryRouterBase()
    st = router.status()
    assert "circuit_breaker" in st
    cb_st = st["circuit_breaker"]
    assert cb_st["name"] == "azure_openai"
    assert cb_st["state"] == "CLOSED"
    assert cb_st["failure_threshold"] == 3
    assert cb_st["recovery_timeout_s"] == 30.0

    # Trip the circuit breaker
    router.circuit_breaker.record_failure()
    router.circuit_breaker.record_failure()
    router.circuit_breaker.record_failure()

    st_tripped = router.status()
    assert st_tripped["circuit_breaker"]["state"] == "OPEN"
    assert st_tripped["circuit_breaker"]["consecutive_failures"] == 3
    assert st_tripped["circuit_breaker"]["total_trips"] == 1

    # Reset
    router.circuit_breaker.reset()
    assert router.status()["circuit_breaker"]["state"] == "CLOSED"
    print("[PASS] FoundryRouterBase circuit breaker status and telemetry")


def test_non_retryable_4xx_does_not_trip_breaker():
    router = FoundryRouterBase()

    class FakeResponse:
        status_code = 401
        headers = {}

        def raise_for_status(self):
            raise requests.HTTPError("401 Client Error", response=self)

    original_post = requests.post
    requests.post = lambda *args, **kwargs: FakeResponse()  # type: ignore[assignment]
    try:
        try:
            router._chat("deployment", [{"role": "user", "content": "hello"}])
            assert False, "Should have raised HTTPError"
        except requests.HTTPError:
            pass
    finally:
        requests.post = original_post  # type: ignore[assignment]

    assert router.circuit_breaker.state == CircuitState.CLOSED
    assert router.circuit_breaker.status()["consecutive_failures"] == 0
    print("[PASS] Non-retryable 4xx fails fast without tripping the breaker")


def test_async_achat_execution():
    router = FoundryRouterBase()

    # Verify _achat handles monkeypatched _chat
    router._chat = lambda deployment, messages, **kwargs: '{"status": "ok"}'  # type: ignore[assignment]
    loop = asyncio.get_event_loop()
    res = loop.run_until_complete(
        router._achat("fake_deployment", [{"role": "user", "content": "hello"}])
    )
    assert res == '{"status": "ok"}'
    print("[PASS] FoundryRouterBase _achat delegates cleanly")


def test_content_safety_async():
    client = ContentSafetyClient(endpoint="", key="")
    loop = asyncio.get_event_loop()
    res = loop.run_until_complete(client.analyze_async("test sentence"))
    assert res["status"] == "SKIPPED"
    assert res["configured"] is False
    print("[PASS] ContentSafetyClient analyze_async unconfigured guard")


def test_content_safety_parses_categories_analysis():
    client = ContentSafetyClient(
        endpoint="https://example.cognitiveservices.azure.com", key="test-key"
    )
    verdict = client._format_result({
        "categoriesAnalysis": [
            {"category": "Hate", "severity": 4},
            {"category": "Violence", "severity": 0},
        ]
    })
    assert verdict["status"] == "FLAGGED"
    assert verdict["max_severity"] == 4
    assert len(verdict["categories"]) == 1

    legacy = client._format_result({
        "categories": [{"category": "Violence", "severity": 2}]
    })
    assert legacy["status"] == "FLAGGED"
    assert legacy["max_severity"] == 2
    print("[PASS] Content Safety parses categoriesAnalysis (and legacy categories)")


def test_personalizer_build_async_uses_async_translator():
    pers = Personalizer(Settings(translator_key="test-key"))
    async_translate = AsyncMock(return_value={
        "es": "Calma total.",
        "ar": "هدوء تام.",
        "hi": "पूरा संयम।",
    })
    sync_translate = MagicMock(side_effect=AssertionError("sync translator used"))
    pers._azure_translate_async = async_translate
    pers._azure_translate = sync_translate

    stage_c = {"archetype": "rhythm_shift", "stage_c_explainability": {}}
    ev = {
        "team": "NLA",
        "clock": "12:34",
        "pdr": 72.0,
        "delta_xt": 0.04,
        "player_name": "Test Player",
        "speed_kmh": 31.0,
        "player_id": "p1",
    }
    metrics = {
        "chaos_index": 0.42,
        "possession": "NLA",
        "ppda": {"NLA": 8.0, "MCS": 9.0},
        "def_lines": {"NLA": 40.0, "MCS": 42.0},
        "team_stats": {"NLA": {"pass_accuracy": 88.0, "shots": 5}},
    }
    loop = asyncio.get_event_loop()
    packet = loop.run_until_complete(
        pers.build_async(stage_c, ev, metrics, {"NLA": 1, "MCS": 0})
    )

    stage_e = packet["stage_e_personalization"]
    assert stage_e["translations"]["es"] == "Calma total."
    assert stage_e["translations"]["ar"] == "هدوء تام."
    assert pers.translator_status()["last_used"] is not None
    async_translate.assert_awaited_once()
    sync_translate.assert_not_called()
    print("[PASS] Personalizer build_async awaits the async translator")


def test_personalizer_async_translate():
    pers = Personalizer()
    loop = asyncio.get_event_loop()
    res = loop.run_until_complete(pers._azure_translate_async("hello"))
    # Unconfigured key should return None / fall back cleanly
    assert res is None or isinstance(res, dict)
    print("[PASS] Personalizer _azure_translate_async unconfigured guard")


if __name__ == "__main__":
    test_circuit_breaker_lifecycle()
    test_circuit_breaker_half_open_failure()
    test_foundry_router_circuit_breaker_telemetry()
    test_non_retryable_4xx_does_not_trip_breaker()
    test_async_achat_execution()
    test_content_safety_async()
    test_content_safety_parses_categories_analysis()
    test_personalizer_build_async_uses_async_translator()
    test_personalizer_async_translate()
    print("\nALL 9 RESILIENCE & ASYNC TRANSPORT TESTS PASSED")
