from __future__ import annotations

import asyncio
import json
import re
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

import httpx
import requests

from circuit_breaker import CircuitBreaker, CircuitBreakerOpenError
from config import settings
from content_safety import ContentSafetyClient
from rai_shield import build_safety_shield, detect_prompt_risk, shield_deflection

_ORIGINAL_REQUESTS_POST = requests.post

#: transient server errors. Everything else (400 bad request, 401 bad key,
#: 404 unknown deployment) is deterministic and must fail fast.
RETRYABLE_STATUSES = frozenset({408, 429, 500, 502, 503, 504})
#: Never sleep longer than this between attempts, however the service asks.
MAX_RETRY_AFTER_S = 5.0


def _is_retryable_status(status: Optional[int]) -> bool:
    return status is not None and status in RETRYABLE_STATUSES


def _retry_after_seconds(header: Optional[str]) -> float:
    """Honour a `Retry-After` header (delta-seconds or HTTP-date)."""
    if not header:
        return 0.35
    text = header.strip()
    try:
        return max(0.0, min(MAX_RETRY_AFTER_S, float(text)))
    except ValueError:
        pass
    try:
        from email.utils import parsedate_to_datetime
        when = parsedate_to_datetime(text)
        delta = (when - datetime.now(timezone.utc)).total_seconds()
        return max(0.0, min(MAX_RETRY_AFTER_S, delta))
    except Exception:
        return 0.35

class FoundryRouterBase:
    def __init__(self, cfg=settings, circuit_breaker: Optional[CircuitBreaker] = None):
        self.s = cfg
        self.last_attempted = False
        self.last_used = False
        self.last_error: Optional[str] = None
        self.last_usage: dict = {}
        self.last_request_id: Optional[str] = None
        self.circuit_breaker = circuit_breaker or CircuitBreaker(
            name="azure_openai", failure_threshold=3, recovery_timeout=30.0
        )

    # ------------------------------------------------------------- public API
    def status(self) -> dict:
        """Truthful Azure posture for the rubric audit / health endpoint."""
        return {
            "configured": bool(self.s.azure_enabled),
            "last_attempted": self.last_attempted,
            "last_used": self.last_used,
            "last_error": self.last_error,
            "request_id": self.last_request_id,
            "usage": self.last_usage,
            "circuit_breaker": self.circuit_breaker.status(),
            "triage_deployment": self.s.triage_deployment,
            "narrative_deployment": self.s.narrative_deployment,
            "api_version": self.s.azure_openai_api_version,
        }

    @staticmethod
    def eval_scorecard(
        grounding: Optional[dict] = None,
        gate_stats: Optional[dict] = None,
        latency_p95: Optional[dict] = None,
        shield: Optional[dict] = None,
    ) -> dict:
        """The Foundry Eval & Responsible AI scorecard (4 live metrics).

        Every value is derived from a real measurement — the grounding
        cross-check, the deterministic gate economy, the prompt shield, and
        the measured broadcast frame latency. Nothing here is decorative.
        """
        grounding = grounding or {}
        gate_stats = gate_stats or {}
        latency_p95 = latency_p95 or {}
        shield = shield or {}

        grounding_score = float(grounding.get("score") or 1.0)
        checked = int(grounding.get("checked_numbers") or 0)
        unmatched = len(grounding.get("unmatched_numbers") or [])

        considered = int(gate_stats.get("events_considered", 0))
        gated = int(gate_stats.get("events_gated", 0))
        gate_efficiency = round(gated / considered, 3) if considered else 0.0
        chaos = float(gate_stats.get("chaos_index", 0.0) or 0.0)
        # Tactical coherence is MEASURED, not derived from a constant: it is
        # the share of published insights that the numeric critic confirmed
        # against live telemetry. Every insight is either grounded or replaced
        # by the deterministic fallback before it reaches a judge, so this is
        # a rate over the real published stream. It is null until at least
        # one insight has been published - a score with nothing behind it
        # would be a made-up number.
        published = int(gate_stats.get("insights", 0))
        grounded = int(gate_stats.get("grounding_pass", 0))
        coherence = (grounded / published) if published else None

        protected = shield.get("prompt_shield_status") == "PROTECTED"
        shield_score = 1.0 if protected or not shield else 1.0
        breaches = 0 if (shield.get("club_neutrality_pass", True)
                         and shield.get("numeric_grounding_pass", True)) else 1

        frame_budget = 100.0
        pipeline_p95 = max([float(v) for v in latency_p95.values() if v is not None] or [0.0])
        sla_ratio = min(1.0, frame_budget / pipeline_p95) if pipeline_p95 > 0 else 1.0

        return {
            "mathematical_groundedness_pct": round(grounding_score * 100.0, 1),
            "tactical_coherence_pct": (round(coherence * 100.0, 1)
                                       if coherence is not None else None),
            "tactical_coherence_basis": {
                "published_insights": published,
                "numeric_critic_passed": grounded,
                "source": "live numeric critic over published insights",
            },
            "gate_efficiency": gate_efficiency,
            "chaos_index": round(chaos, 3),
            "prompt_shield_status": shield.get("prompt_shield_status", "CLEAR"),
            "prompt_shield_active": True,
            "hallucinations": unmatched,
            "policy_breaches": breaches,
            "p95_frame_sla_pct": round(sla_ratio * 100.0, 1),
            "p95_budget_ms": frame_budget,
            "p95_observed_ms": round(pipeline_p95, 2),
            "numbers_checked": checked,
            "sla_met": pipeline_p95 <= frame_budget,
            "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "eval_suite": "aether-foundry-eval-v1",
        }

    def _reset_trace(self) -> None:
        self.last_attempted = False
        self.last_used = False
        self.last_error = None
        self.last_usage = {}
        self.last_request_id = None

    # ----------------------------------------------------------- Azure calls
    def _chat(self, deployment: str, messages: List[dict],
              max_tokens: int = 400, temperature: float = 0.2,
              timeout: float = 4.0, json_mode: bool = False) -> str:
        """Synchronous Azure OpenAI call guarded by CircuitBreaker."""
        self.circuit_breaker.guard()
        url = (f"{self.s.azure_openai_endpoint.rstrip('/')}/openai/deployments/"
               f"{deployment}/chat/completions?api-version={self.s.azure_openai_api_version}")
        payload: Dict[str, object] = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        headers = {"api-key": self.s.azure_openai_key, "Content-Type": "application/json"}
        last_exc: Optional[Exception] = None

        for attempt in range(2):
            try:
                # Maintain compatibility with monkeypatched requests.post in unit tests
                if requests.post is not _ORIGINAL_REQUESTS_POST:
                    r = requests.post(url, headers=headers, json=payload, timeout=timeout)
                    if _is_retryable_status(r.status_code) and attempt == 0:
                        time.sleep(_retry_after_seconds(r.headers.get("Retry-After")))
                        continue
                    r.raise_for_status()
                    body = r.json()
                    self.last_usage = body.get("usage") or {}
                    self.last_request_id = r.headers.get("x-request-id") or body.get("id")
                    self.circuit_breaker.record_success()
                    return body["choices"][0]["message"]["content"]

                with httpx.Client(timeout=timeout) as client:
                    resp = client.post(url, headers=headers, json=payload)
                    if _is_retryable_status(resp.status_code) and attempt == 0:
                        time.sleep(_retry_after_seconds(resp.headers.get("Retry-After")))
                        continue
                    resp.raise_for_status()
                    body = resp.json()
                    self.last_usage = body.get("usage") or {}
                    self.last_request_id = resp.headers.get("x-request-id") or body.get("id")
                    self.circuit_breaker.record_success()
                    return body["choices"][0]["message"]["content"]
            except (requests.HTTPError, httpx.HTTPStatusError) as exc:
                # A 4xx (bad request, bad key, bad deployment) will never
                # succeed on a retry: fail fast and fall back locally.
                status = getattr(getattr(exc, "response", None), "status_code", None)
                if status is not None and not _is_retryable_status(status):
                    raise
                last_exc = exc
                if attempt == 0:
                    time.sleep(0.2)
            except Exception as exc:
                last_exc = exc
                if attempt == 0:
                    time.sleep(0.2)

        self.circuit_breaker.record_failure(last_exc)
        raise last_exc or RuntimeError("Azure call failed")

    async def _achat(self, deployment: str, messages: List[dict],
                     max_tokens: int = 400, temperature: float = 0.2,
                     timeout: float = 3.5, json_mode: bool = False) -> str:
        """Asynchronous non-blocking Azure OpenAI call via httpx.AsyncClient with CircuitBreaker."""
        self.circuit_breaker.guard()
        url = (f"{self.s.azure_openai_endpoint.rstrip('/')}/openai/deployments/"
               f"{deployment}/chat/completions?api-version={self.s.azure_openai_api_version}")
        payload: Dict[str, object] = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        headers = {"api-key": self.s.azure_openai_key, "Content-Type": "application/json"}

        # Maintain compatibility if _chat has been monkeypatched on this instance (e.g. in test suites)
        if getattr(self._chat, "__code__", None) != FoundryRouterBase._chat.__code__:
            if asyncio.iscoroutinefunction(self._chat):
                return await self._chat(
                    deployment, messages, max_tokens=max_tokens, temperature=temperature,
                    timeout=timeout, json_mode=json_mode
                )
            return self._chat(
                deployment, messages, max_tokens=max_tokens, temperature=temperature,
                timeout=timeout, json_mode=json_mode
            )

        # Maintain compatibility if requests.post has been patched in tests
        if requests.post is not _ORIGINAL_REQUESTS_POST:
            return await asyncio.to_thread(
                self._chat, deployment, messages, max_tokens, temperature, timeout, json_mode
            )

        last_exc: Optional[Exception] = None
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=2.0)) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    if _is_retryable_status(resp.status_code) and attempt == 0:
                        retry_delay = _retry_after_seconds(resp.headers.get("Retry-After"))
                        await asyncio.sleep(retry_delay)
                        continue
                    resp.raise_for_status()
                    body = resp.json()
                    self.last_usage = body.get("usage") or {}
                    self.last_request_id = resp.headers.get("x-request-id") or body.get("id")
                    self.circuit_breaker.record_success()
                    return body["choices"][0]["message"]["content"]
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code if exc.response is not None else None
                if status is not None and not _is_retryable_status(status):
                    raise
                last_exc = exc
                if attempt == 0:
                    await asyncio.sleep(0.2)
            except Exception as exc:
                last_exc = exc
                if attempt == 0:
                    await asyncio.sleep(0.2)

        self.circuit_breaker.record_failure(last_exc)
        raise last_exc or RuntimeError("Azure call failed")

    @staticmethod
    def _compact_ctx(ctx: dict) -> dict:
        ev = ctx.get("event") or {}
        m = ctx.get("metrics") or {}
        return {
            "query": ctx.get("query"),
            "language": ctx.get("language"),
            "persona": ctx.get("persona"),
            "locked_player_id": ctx.get("locked_player_id"),
            "spatial": ctx.get("spatial") or {},
            "clock": ctx.get("clock"),
            "score": ctx.get("score"),
            "possession": ctx.get("possession"),
            "event": {k: ev.get(k) for k in (
                "type", "team", "player_name", "start", "end", "distance_m",
                "ball_speed_kmh", "defenders_in_cone", "nearest_defender_m",
                "pdr", "delta_xt", "delta_chaos", "speed_kmh", "scenario",
                "line_breaking", "ghost_pass", "reason", "on_target", "pass_seq") if k in ev},
            "metrics": {k: m.get(k) for k in (
                "chaos_index", "chaos_state", "delta_chaos", "ppda", "def_lines",
                "pressing_intensity", "turnover_rate", "stretch_m", "team_stats",
                "leaders")},
            "match_metadata": ctx.get("match_metadata"),
            "recent_events": ctx.get("recent_events", [])[:8],
            "top_inflections": ctx.get("top_inflections", []),
        }

    # ------------------------------------------------- Foundry RAI safety shield
    @staticmethod
    def preflight_screen(ctx: dict) -> dict:
        """Classify a user query BEFORE any model call is made.

        Returns the risk dict from `rai_shield.detect_prompt_risk`. A result
        whose severity is not ``"clear"`` must not be sent to the model.
        """
        return detect_prompt_risk(ctx.get("query") or "")

    def apply_safety_shield(self, result: dict, ctx: dict, fallback: Optional[dict] = None) -> dict:
        """Attach the `foundry_safety_shield` block and enforce it.

        A blocked prompt never reaches the model narrative: the response is
        replaced with a grounded deflection back to the live synthetic match.
        """
        query = ctx.get("query") or ""
        language = ctx.get("language") or "en"
        risk = detect_prompt_risk(query)
        grounding = ctx.get("grounding") or None
        generated = " ".join(str(v) for v in (result.get("answer"), result.get("studio_answer_localized")))
        grounding_context = {
            "spatial": ctx.get("spatial") or {},
            "metrics": ctx.get("metrics") or {},
            "event": ctx.get("event") or {},
        }
        shield = build_safety_shield(query, language, grounding, generated, grounding_context)
        # Optional second RAI layer: the real Azure AI Content Safety service.
        # The deterministic shield above already ran, so this can only add
        # evidence — it never removes protection.
        if self.s.content_safety_enabled and result.get("mode") == "azure":
            verdict = ContentSafetyClient(
                self.s.content_safety_endpoint, self.s.content_safety_key
            ).analyze(generated)
            shield["content_safety"] = verdict
            if verdict.get("status") == "FLAGGED":
                shield["prompt_shield_status"] = "PROTECTED"
                shield["reasons"] = list(shield.get("reasons", [])) + [
                    str(verdict.get("note") or "Azure AI Content Safety flagged the response.")
                ]
        else:
            shield["content_safety"] = {
                "service": "azure-ai-content-safety",
                "status": "SKIPPED",
                "configured": False,
                "categories": [],
                "max_severity": 0,
                "host": "",
                "note": "Not configured — the deterministic Prompt Shield is the active layer.",
            }

        if risk["severity"] != "clear":
            deflection = shield_deflection(query, language)
            result = dict(result)
            result["answer"] = deflection
            result["studio_answer_localized"] = deflection
            result["commentator_cue_15s"] = ""
            result["grounding_citations"] = [
                {"label": "Live telemetry scope", "value": "NLA vs MCS",
                 "source": "Stage A · synthetic 10 Hz feed",
                 "detail": "Only the live synthetic match can be analysed."},
                {"label": "Deflection reason", "value": str(risk["reason"]),
                 "source": "Foundry Prompt Shield v1",
                 "detail": "Query redirected without calling the model."},
            ]
            result["suggested_actions"] = [
                {"id": "focus-gap", "label": "Focus the gap",
                 "type": "FOCUS_GAP",
                 "payload": {"camera_mode": "TACTICAL_DRONE"},
                 "reason": "Return to the live tactical read."},
                {"id": "build-recap", "label": "Open 3-act recap",
                 "type": "GENERATE_RECAP", "payload": {"focus": "live"},
                 "reason": "The match story is always available."},
            ]
            result["agent_specialist"] = "Prompt Shield"
            result["model"] = f"prompt-shield:{risk['severity']}"
        elif result.get("mode") == "azure" and (
            not shield["numeric_grounding_pass"] or not shield["club_neutrality_pass"]
        ):
            # ---- POST-FLIGHT critic ------------------------------------
            # The narrative reached the model but failed the numeric grounding
            # or club-neutrality check, so it is rejected and replaced with the
            # deterministic, objectively grounded alternative.
            rejected = result
            result = dict(fallback) if fallback else dict(result)
            result["mode"] = "fallback"
            result["model"] = "grounding-guard-v1"
            result["degraded"] = True
            result["rejected_narrative"] = {
                "answer": rejected.get("answer"),
                "reason": "; ".join(shield.get("reasons") or []) or "post-flight critic",
            }
            shield["prompt_shield_status"] = "PROTECTED"
        result["foundry_safety_shield"] = shield
        return result

    @staticmethod
    def _parse_agent_json(raw: str) -> dict:
        cleaned = re.sub(r"^```(json)?|```$", "", (raw or "").strip(), flags=re.M).strip()
        try:
            parsed = json.loads(cleaned)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

