"""Deterministic execution trace for the Stage B -> C -> D/E handoff.

The trace is intentionally honest: it records the real gate decision, the
actual Stage C routing mode, measured handoff timings, and a numeric
cross-check of Azure narrative claims against the Stage B event/metric snapshot.
"""
from __future__ import annotations

import hashlib
import math
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _flatten_numbers(value: Any) -> Iterable[float]:
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        if math.isfinite(float(value)):
            yield float(value)
        return
    if isinstance(value, dict):
        for item in value.values():
            yield from _flatten_numbers(item)
        return
    if isinstance(value, (list, tuple)):
        for item in value:
            yield from _flatten_numbers(item)


def _allowed_numbers(event: dict, metrics: dict, state: dict) -> set[float]:
    allowed = set(_flatten_numbers(event))
    allowed.update(_flatten_numbers(metrics))
    allowed.update(_flatten_numbers(state.get("match_metadata") or {}))
    score = state.get("score") or {}
    allowed.update(_flatten_numbers(score))
    clock = str(state.get("clock") or "")
    for part in clock.replace(".", ":").split(":"):
        try:
            allowed.add(float(part))
        except ValueError:
            pass
    allowed.update({0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 10.0, 15.0, 16.0, 22.0, 60.0, 68.0, 80.0, 100.0, 105.0})
    expanded = set(allowed)
    for value in allowed:
        expanded.add(abs(value))
        expanded.add(round(value))
        expanded.add(round(value, 1))
        expanded.add(round(value, 2))
        if 0.0 <= abs(value) <= 1.0:
            expanded.add(round(value * 100.0, 1))
        elif abs(value) >= 1.0:
            expanded.add(round(value / 100.0, 4))
    return expanded


def _matches(value: float, allowed: set[float]) -> bool:
    tolerance = 0.61 if abs(value) >= 10 else 0.11
    return any(abs(value - candidate) <= tolerance for candidate in allowed)


def verify_grounding(stage_c: dict, event: dict, metrics: dict, state: dict) -> dict:
    if stage_c.get("mode") != "azure":
        return {
            "status": "fallback_verified",
            "score": 1.0,
            "checked_numbers": 0,
            "unmatched_numbers": [],
            "source": "deterministic_stage_c_template",
            "note": "Deterministic Stage C template generated from Stage B event and metric values.",
        }

    explainability = stage_c.get("stage_c_explainability") or {}
    text = " ".join(str(v) for v in explainability.values())
    tokens = NUMBER_RE.findall(text)
    allowed = _allowed_numbers(event, metrics, state)
    unmatched = [token for token in tokens if not _matches(float(token), allowed)]
    checked = len(tokens)
    score = round(1.0 - (len(unmatched) / checked), 3) if checked else 1.0
    return {
        "status": "verified" if not unmatched else "review",
        "score": score,
        "checked_numbers": checked,
        "unmatched_numbers": unmatched,
        "source": "stage_b_event_metrics",
        "note": (
            f"{checked} numeric claims cross-checked against the Stage B event/metric snapshot; "
            f"{len(unmatched)} unmatched."
        ),
    }


def gate_snapshot(stats: Optional[dict]) -> dict:
    stats = stats or {}
    considered = int(stats.get("events_considered", 0))
    gated = int(stats.get("events_gated", 0))
    insights = int(stats.get("insights", 0))
    ticks = int(stats.get("ticks", 0))
    filtered = max(0, considered - gated)
    return {
        "considered_events": considered,
        "gated_events": gated,
        "filtered_events": filtered,
        "filter_ratio": round(filtered / considered, 3) if considered else 0.0,
        "ticks": ticks,
        "insights": insights,
        "ticks_per_insight": round(ticks / insights, 1) if insights else 0.0,
    }


def _trace_id(event: dict, state: dict) -> str:
    seed = f"{event.get('id') or event.get('type')}:{state.get('t_match')}:{state.get('clock')}"
    return "trace_" + hashlib.sha1(seed.encode("utf-8")).hexdigest()[:12]


def build_agent_trace(
    event: dict,
    metrics: dict,
    state: dict,
    stage_c: dict,
    packet: dict,
    *,
    stage_b_ms: float = 0.0,
    stage_d_ms: float = 0.0,
    stage_e_ms: float = 0.0,
    gate_stats: Optional[dict] = None,
    guardrail: Optional[dict] = None,
) -> dict:
    mode = stage_c.get("mode", "fallback")
    timings = stage_c.get("agent_timings") or {}
    triage_ms = round(float(timings.get("triage_ms") or 0.0), 2)
    narrative_ms = round(float(timings.get("narrative_ms") or 0.0), 2)
    grounding_ms = round(float(timings.get("grounding_ms") or 0.0), 2)
    ground_t0 = time.perf_counter()
    grounding = verify_grounding(stage_c, event, metrics, state)
    grounding_ms += round((time.perf_counter() - ground_t0) * 1000.0, 2)
    stage_c_ms = float(stage_c.get("latency_ms") or 0.0)
    analyst_ms = stage_c_ms if stage_c_ms > 0 else narrative_ms + grounding_ms
    gate = event.get("ai_gate") or {}
    reasons = gate.get("reasons") or []
    pdr = event.get("pdr")
    delta_xt = event.get("delta_xt")
    delta_chaos = event.get("delta_chaos")
    ghost = event.get("ghost_pass") or {}
    overlay = packet.get("stage_d_broadcast_overlay") or {}
    camera = packet.get("camera_directive") or {}
    personalization = packet.get("stage_e_personalization") or {}
    languages = list((personalization.get("translations") or {}).keys())
    archetype = stage_c.get("archetype", "rhythm_shift")
    model = stage_c.get("model", "deterministic-fallback-v1")

    sentinel_summary = "Gate accepted the moment"
    if pdr is not None:
        sentinel_summary = f"PDR {pdr:.0f}% · ΔxT {(delta_xt or 0.0):+.2f}"
    if delta_chaos is not None:
        sentinel_summary += f" · ΔChaos {delta_chaos:+.2f}"
    if ghost:
        sentinel_summary += f" · ghost {float(ghost.get('delta_xt') or 0.0):+.2f} xT"

    chain = [
        {
            "id": "sentinel",
            "agent": "Spatial Sentinel",
            "role": "Deterministic gate",
            "status": "completed",
            "latency_ms": round(stage_b_ms, 2),
            "summary": sentinel_summary,
            "detail": "Gate fired: " + ("; ".join(reasons) if reasons else "deterministic threshold"),
        },
        {
            "id": "triage",
            "agent": "Tactical Triage",
            "role": "Archetype router",
            "status": "completed" if mode == "azure" else "fallback",
            "latency_ms": triage_ms,
            "summary": archetype.replace("_", " ").title(),
            "detail": f"{model} · {mode}",
        },
        {
            "id": "analyst",
            "agent": "Causal Analyst + Critic",
            "role": "Narrative + numeric critic",
            "status": "review" if grounding["status"] == "review" else ("completed" if mode == "azure" else "fallback"),
            "latency_ms": round(analyst_ms, 2),
            "summary": f"Grounding {grounding['score'] * 100:.0f}% · {grounding['checked_numbers']} checks",
            "detail": f"{grounding['note']} Route: triage {triage_ms:.1f}ms / narrative {narrative_ms:.1f}ms.",
        },
        {
            "id": "director",
            "agent": "Broadcast Director",
            "role": "Overlay + camera + i18n",
            "status": "completed",
            "latency_ms": round(stage_d_ms + stage_e_ms, 2),
            "summary": f"{overlay.get('overlay_type', 'overlay')} · {camera.get('recommended_mode', 'TELE_BROADCAST')}",
            "detail": f"{len(personalization.get('translations') or {})} languages · persona fork ready",
        },
    ]

    return {
        "trace_id": _trace_id(event, state),
        "event_id": event.get("id"),
        "anchor_clock": state.get("clock", event.get("clock", "—")),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "archetype": archetype,
        "model": model,
        "gate": {
            "should_explain": bool(gate.get("should_explain")),
            "reasons": reasons,
            "pdr": round(float(pdr), 1) if pdr is not None else None,
            "delta_xt": round(float(delta_xt), 3) if delta_xt is not None else None,
            "delta_chaos": round(float(delta_chaos), 3) if delta_chaos is not None else None,
        },
        "handoff_chain": chain,
        "grounding": grounding,
        "guardrail": guardrail,
        "compute": gate_snapshot(gate_stats),
        "languages": languages,
    }


def p95(values: Iterable[float]) -> float:
    ordered = sorted(float(v) for v in values)
    if not ordered:
        return 0.0
    index = min(len(ordered) - 1, max(0, round(0.95 * (len(ordered) - 1))))
    return round(ordered[index], 2)
