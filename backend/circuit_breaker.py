"""
AETHER PITCH — Resilience Circuit Breaker for External Cloud Services.

Protects the real-time simulation and broadcast engine from cascading failures
when upstream cloud APIs (Azure OpenAI, Azure AI Content Safety, Translator)
experience transient outages, rate limits, or network timeouts.

State Machine:
  CLOSED  --[failure_threshold exceeded]--> OPEN
  OPEN    --[recovery_timeout elapsed]-->   HALF_OPEN
  HALF_OPEN --[success]-->                   CLOSED
  HALF_OPEN --[failure]-->                   OPEN
"""
from __future__ import annotations

import threading
import time
from enum import Enum
from typing import Any, Dict, Optional


class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitBreakerOpenError(RuntimeError):
    """Raised when an operation is attempted while the circuit is open."""
    def __init__(self, message: str, retry_after: float):
        super().__init__(message)
        self.retry_after = retry_after


class CircuitBreaker:
    """Thread-safe circuit breaker with configurable failure threshold and cooldown."""

    def __init__(
        self,
        name: str = "azure_service",
        failure_threshold: int = 3,
        recovery_timeout: float = 30.0,
    ) -> None:
        self.name = name
        self.failure_threshold = max(1, failure_threshold)
        self.recovery_timeout = max(0.01, recovery_timeout)

        self._state = CircuitState.CLOSED
        self._consecutive_failures = 0
        self._last_failure_time: Optional[float] = None
        self._last_state_change: float = time.time()
        self._total_trips = 0
        self._total_requests = 0
        self._total_failures = 0
        self._lock = threading.Lock()

    @property
    def state(self) -> CircuitState:
        with self._lock:
            self._evaluate_state_locked()
            return self._state

    def _evaluate_state_locked(self) -> None:
        """Internal helper to evaluate OPEN -> HALF_OPEN transition."""
        if self._state == CircuitState.OPEN:
            if self._last_failure_time is not None:
                elapsed = time.time() - self._last_failure_time
                if elapsed >= self.recovery_timeout:
                    self._state = CircuitState.HALF_OPEN
                    self._last_state_change = time.time()

    def allow_request(self) -> bool:
        """Check whether a request is allowed to proceed."""
        with self._lock:
            self._evaluate_state_locked()
            self._total_requests += 1
            return self._state in (CircuitState.CLOSED, CircuitState.HALF_OPEN)

    def guard(self) -> None:
        """Raise CircuitBreakerOpenError if the circuit is currently open."""
        with self._lock:
            self._evaluate_state_locked()
            if self._state == CircuitState.OPEN:
                elapsed = time.time() - (self._last_failure_time or time.time())
                retry_after = max(0.1, self.recovery_timeout - elapsed)
                raise CircuitBreakerOpenError(
                    f"Circuit breaker '{self.name}' is OPEN after {self._consecutive_failures} failures. "
                    f"Next trial allowed in {retry_after:.1f}s.",
                    retry_after=retry_after,
                )
            self._total_requests += 1

    def record_success(self) -> None:
        """Record a successful external call; resets failures and closes circuit."""
        with self._lock:
            self._consecutive_failures = 0
            if self._state != CircuitState.CLOSED:
                self._state = CircuitState.CLOSED
                self._last_state_change = time.time()

    def record_failure(self, exc: Optional[Exception] = None) -> None:
        """Record a failed call; trips circuit if threshold is reached."""
        with self._lock:
            now = time.time()
            self._total_failures += 1
            self._consecutive_failures += 1
            self._last_failure_time = now

            if self._state == CircuitState.HALF_OPEN:
                # Probe request failed; trip back to OPEN
                self._state = CircuitState.OPEN
                self._last_state_change = now
                self._total_trips += 1
            elif self._state == CircuitState.CLOSED and self._consecutive_failures >= self.failure_threshold:
                # Threshold reached; trip to OPEN
                self._state = CircuitState.OPEN
                self._last_state_change = now
                self._total_trips += 1

    def reset(self) -> None:
        """Manually reset the circuit breaker back to initial CLOSED state."""
        with self._lock:
            self._state = CircuitState.CLOSED
            self._consecutive_failures = 0
            self._last_failure_time = None
            self._last_state_change = time.time()

    def status(self) -> Dict[str, Any]:
        """Export circuit breaker state for diagnostics and health dashboards."""
        with self._lock:
            self._evaluate_state_locked()
            now = time.time()
            cooldown_remaining = 0.0
            if self._state == CircuitState.OPEN and self._last_failure_time:
                cooldown_remaining = max(0.0, self.recovery_timeout - (now - self._last_failure_time))

            return {
                "name": self.name,
                "state": self._state.value,
                "consecutive_failures": self._consecutive_failures,
                "failure_threshold": self.failure_threshold,
                "recovery_timeout_s": self.recovery_timeout,
                "cooldown_remaining_s": round(cooldown_remaining, 1),
                "total_trips": self._total_trips,
                "total_requests": self._total_requests,
                "total_failures": self._total_failures,
            }
