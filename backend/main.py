"""
AETHER PITCH — Studio Engine (FastAPI orchestrator)
===================================================
Runs the full 5-stage pipeline on one event loop and broadcasts over WebSocket:

  Stage (a) Ingest     — PitchForge 10Hz synthetic tracking + auto-events
  Stage (b) Interpret  — deterministic math: Chaos Index, PDR, ΔxT, ghost passes
  Stage (c) Explain    — Azure AI Foundry-hosted triage + narrative reasoning (fallback: local)
  Stage (d) Render     — time-coded broadcast overlay packets
  Stage (e) Personalize— analyst/casual fork + EN/ES/AR/HI localization

WebSocket packet types: hello | tick (10Hz) | metrics (2Hz) | event | insight |
                        pipeline (2Hz) | recap
REST: POST /api/scenario/{name}  (chaos_counter | high_press_turnover |
                                   tactical_inversion | halftime_recap)
      GET  /api/health | /api/state | /api/insights
"""
from __future__ import annotations

import asyncio
import copy
import json
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from agent_trace import build_agent_trace, gate_snapshot, p95, verify_grounding
from config import settings
from rai_shield import build_safety_shield, detect_prompt_risk
from stage_a_synthetic_engine import PitchForgeEngine
from stage_b_math_engine import TacticalMathEngine
from stage_c_foundry_agents import FoundryRouter
from stage_d_e_personalizer import Personalizer

TICK_DT = 1.0 / settings.tick_rate_hz          # 0.1 s sim step per tick

app = FastAPI(title="AETHER PITCH — Studio Engine", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],           # hackathon demo: studio frontend on any origin
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = PitchForgeEngine(seed=settings.seed, start_minute=settings.match_start_minute)
math = TacticalMathEngine(window_s=settings.chaos_window_s)
foundry = FoundryRouter(settings)
personalizer = Personalizer(settings)


class Hub:
    """Fan-out broadcaster for every connected studio client."""

    def __init__(self) -> None:
        self.clients: Set[WebSocket] = set()
        self.lock = asyncio.Lock()

    async def join(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self.lock:
            self.clients.add(ws)

    async def leave(self, ws: WebSocket) -> None:
        async with self.lock:
            self.clients.discard(ws)

    async def broadcast(self, packet: dict) -> None:
        dead: List[WebSocket] = []
        async with self.lock:
            targets = list(self.clients)
        for ws in targets:
            try:
                await ws.send_json(packet)
            except Exception:
                dead.append(ws)
        if dead:
            async with self.lock:
                for ws in dead:
                    self.clients.discard(ws)


hub = Hub()
last_state: dict = {}
last_metrics: dict = {}
last_ghost: Optional[tuple] = None    # expire, target xy, ghost ΔxT, actual ΔxT, target id, completion %, net gain
latest_ghost_counterfactual: Optional[dict] = None
insights: deque = deque(maxlen=40)
top_inflections: List[dict] = []
recap_archive: deque = deque(maxlen=80)
active_personalization: Dict[str, Any] = {
    "persona_mode": "TWINCAST_SPLIT",
    "metric_focus": "ALL",
    "favorite_club_bias": "NEUTRAL",
    "locked_player_id": None,
    "market_language": "en",
    "cognitive_density": "PRO_TACTICAL_DIRECTOR",
    "colorblind_safe": False,
}
pipeline: Dict[str, Any] = {
    "stages": {k: {"latency_ms": 0.0} for k in "abcde"},
    "payloads": {k: "" for k in "abcde"},
    "updated_at": None,
    "agent_trace": None,
    "gate": gate_snapshot({}),
    "latency_p95": {k: 0.0 for k in "abcde"},
}
insight_counter = 0
last_insight_real_ts = 0.0
last_insight_priority = 0.0
latest_agent_trace: Optional[dict] = None
gate_stats = {
    "ticks": 0,
    "events_considered": 0,
    "events_gated": 0,
    "insights": 0,
    "azure_insights": 0,
    "fallback_insights": 0,
    "grounding_pass": 0,
}
latency_samples = {k: deque(maxlen=300) for k in "abcde"}


def _stamp_pipeline(stage: str, latency_ms: float, payload: Any) -> None:
    pipeline["stages"][stage]["latency_ms"] = round(latency_ms, 2)
    latency_samples[stage].append(float(latency_ms))
    pipeline["latency_p95"][stage] = p95(latency_samples[stage])
    try:
        pipeline["payloads"][stage] = json.dumps(payload, default=str)[:900]
    except Exception:
        pipeline["payloads"][stage] = str(payload)[:900]
    pipeline["updated_at"] = datetime.now(timezone.utc).isoformat()


def _archive_event(ev: dict, state: dict, metrics: dict) -> None:
    """Keep full-22-player snapshots for the v5.0 time-travel storyboard."""
    if not state or not state.get("players"):
        return
    if ev.get("type") not in (
        "PASS", "SHOT", "GOAL", "PRESSURE_TRAP", "TURNOVER", "TACKLE",
        "TACTICAL_INVERSION", "SCENARIO_END",
    ):
        return
    snapshot = copy.deepcopy(state)
    clock = snapshot.get("clock", ev.get("clock", "—"))
    snapshot["clock"] = clock
    recap_archive.append({
        "ev": copy.deepcopy(ev),
        "state": snapshot,
        "metrics": copy.deepcopy(metrics),
        "clock": clock,
        "at": time.time(),
    })


def _fallback_pass(state: dict) -> dict:
    """Deterministic actual/ghost pass pair for archive-poor storyboards."""
    players = state.get("players") or []
    if not players:
        return {"actual": {"start": {"x": 52.5, "y": 34.0}, "end": {"x": 78.0, "y": 34.0}},
                "ghost": {"start": {"x": 52.5, "y": 34.0}, "end": {"x": 82.0, "y": 48.0},
                          "delta_xt": 0.214, "target_id": None, "openness_m": 12.0}}
    team = state.get("possession", "NLA")
    attack = sorted(
        (p for p in players if p.get("team") == team and p.get("role") != "GK"),
        key=lambda p: -(p.get("x", 0.0) if team == "NLA" else 105.0 - p.get("x", 0.0)),
    )
    start_p = next((p for p in players if p.get("id") == state.get("carrier")), attack[0])
    end_p = next((p for p in attack if p.get("id") != start_p.get("id")), attack[0])
    start = {"x": round(start_p.get("x", 52.5), 2), "y": round(start_p.get("y", 34.0), 2)}
    end = {"x": round(end_p.get("x", 78.0), 2), "y": round(end_p.get("y", 34.0), 2)}
    actual_delta = math.delta_xt(team, (start["x"], start["y"]), (end["x"], end["y"]))
    ghost = math.ghost_pass(
        state, team, start_p.get("id"), (start["x"], start["y"]),
        actual_delta_xt=actual_delta) or {}
    gx = ghost.get("x", min(100.0, end["x"] + 6.0))
    gy = ghost.get("y", 48.0 if end["y"] < 34.0 else 20.0)
    return {
        "actual": {"start": start, "end": end},
        "ghost": {
            "start": start, "end": {"x": round(gx, 2), "y": round(gy, 2)},
            "delta_xt": float(ghost.get("delta_xt") or 0.214),
            "actual_delta_xt": round(float(actual_delta), 3),
            "ghost_delta_xt": float(ghost.get("ghost_delta_xt") or ghost.get("delta_xt") or 0.214),
            "net_xt_gain": float(ghost.get("net_xt_gain") or 0.0),
            "completion_probability": float(ghost.get("completion_probability") or 0.0),
            "receiver_target_xy": ghost.get("receiver_target_xy") or {"x": round(gx, 2), "y": round(gy, 2)},
            "target_id": ghost.get("target_id"),
            "openness_m": float(ghost.get("openness_m") or 12.0),
        },
    }


def _pick_act(entries: List[dict], used: set, preferred: tuple) -> Optional[dict]:
    for entry in entries:
        if id(entry) in used:
            continue
        if entry.get("ev", {}).get("type") in preferred:
            return entry
    for entry in entries:
        if id(entry) not in used:
            return entry
    return None


async def build_match_recap() -> dict:
    """3-act storyboard with full snapshots, milestones and counterfactuals."""
    entries = list(recap_archive)
    used: set = set()
    act_specs = [
        ("The Tactical Catalyst", "The fullback inversion that broke NLA's back line",
         ("TACTICAL_INVERSION", "PASS"), "TACTICAL_DRONE_ORBIT"),
        ("The Pressure Rupture", "MCS pushed their defensive line 18m higher than baseline",
         ("PRESSURE_TRAP", "TURNOVER", "SHOT"), "TACTICAL_DRONE_ORBIT"),
        ("The Counter-Factual Storm", "3v2 transition — ghost lane worth +0.214 xT",
         ("GOAL", "SHOT", "PASS"), "TACTICAL_DRONE_ORBIT"),
    ]
    acts: List[dict] = []
    for idx, (title, subtitle, preferred, camera) in enumerate(act_specs, 1):
        entry = _pick_act(entries, used, preferred)
        if entry:
            used.add(id(entry))
        state = copy.deepcopy(entry["state"]) if entry else copy.deepcopy(last_state)
        if not state:
            state = engine.state()
        used_ev = (entry or {}).get("ev", {})
        metrics = (entry or {}).get("metrics", {}) or last_metrics or {}
        pair = _fallback_pass(state)
        ev_start = used_ev.get("start")
        ev_end = used_ev.get("end")
        actual = {
            "start": {"x": float(ev_start[0]), "y": float(ev_start[1])} if ev_start else pair["actual"]["start"],
            "end": {"x": float(ev_end[0]), "y": float(ev_end[1])} if ev_end else pair["actual"]["end"],
        }
        ghost_ev = used_ev.get("ghost_pass") or pair["ghost"]
        team = used_ev.get("team") or state.get("possession") or "NLA"
        actual_delta = math.delta_xt(
            team,
            (actual["start"]["x"], actual["start"]["y"]),
            (actual["end"]["x"], actual["end"]["y"]),
        )
        ghost_delta = float(ghost_ev.get("delta_xt") or pair["ghost"]["delta_xt"])
        ghost = {
            "start": actual["start"],
            "end": {"x": float(ghost_ev.get("x", pair["ghost"]["end"]["x"])),
                    "y": float(ghost_ev.get("y", pair["ghost"]["end"]["y"]))},
            "delta_xt": ghost_delta,
            "actual_delta_xt": round(float(ghost_ev.get("actual_delta_xt", actual_delta)), 3),
            "ghost_delta_xt": float(ghost_ev.get("ghost_delta_xt") or ghost_delta),
            "net_xt_gain": float(ghost_ev.get("net_xt_gain") or (ghost_delta - actual_delta)),
            "completion_probability": float(ghost_ev.get("completion_probability") or 0.0),
            "receiver_target_xy": ghost_ev.get("receiver_target_xy") or {
                "x": float(ghost_ev.get("x", pair["ghost"]["end"]["x"])),
                "y": float(ghost_ev.get("y", pair["ghost"]["end"]["y"])),
            },
            "target_id": ghost_ev.get("target_id") or pair["ghost"].get("target_id"),
            "openness_m": float(ghost_ev.get("openness_m") or pair["ghost"].get("openness_m", 0.0)),
        }
        carrier = state.get("carrier")
        pressers = [pid for pid in (used_ev.get("players") or []) if pid]
        primary_id = used_ev.get("player_id") or (pressers[0] if pressers else carrier)
        names_by_id = {p.get("id"): p.get("name") for p in state.get("players", [])}
        primary_name = (used_ev.get("player_name") or names_by_id.get(primary_id)
                        or "the carrier")
        key_ids = [pid for pid in (
            primary_id, *pressers[:2], carrier, ghost.get("target_id"),
        ) if pid]
        key_ids = list(dict.fromkeys(key_ids))[:3]
        if len(key_ids) < 3:
            fillers = sorted(state.get("players", []), key=lambda p: -(p.get("speed_kmh") or 0))
            for p in fillers:
                if p.get("id") not in key_ids:
                    key_ids.append(p.get("id"))
                if len(key_ids) >= 3:
                    break
        ball = state.get("ball") or {"x": actual["end"]["x"], "y": actual["end"]["y"]}
        acts.append({
            "act": idx,
            "title": title,
            "subtitle": subtitle,
            "clock": state.get("clock", (entry or {}).get("clock", "—")),
            "score": state.get("score", {"NLA": 1, "MCS": 1}),
            "team": team,
            "event_type": used_ev.get("type", "PASS"),
            "player_id": primary_id,
            "player_name": primary_name,
            "pdr": float(used_ev.get("pdr") or 0.0),
            "delta_xt": float(used_ev.get("delta_xt") or ghost.get("delta_xt") or 0.0),
            "chaos": float(metrics.get("chaos_index", 0.5) or 0.5),
            "actual_pass": actual,
            "ghost_pass": ghost,
            "key_player_ids": key_ids,
            "highlight_zone": {
                "x_min": max(0.0, min(ball.get("x", 52.5), ghost["end"]["x"]) - 12.0),
                "x_max": min(105.0, max(ball.get("x", 52.5), ghost["end"]["x"]) + 12.0),
                "y_min": max(0.0, min(ball.get("y", 34.0), ghost["end"]["y"]) - 9.0),
                "y_max": min(68.0, max(ball.get("y", 34.0), ghost["end"]["y"]) + 9.0),
                "label": title.upper(),
            },
            "camera_mode": camera,
            "snapshot": state,
        })

    milestones = engine.milestones.summary()[:3]
    while len(milestones) < 3:
        n = len(milestones) + 1
        milestones.append({
            "id": f"ms_fallback_{n}", "type": "MILESTONE_MATCH_PHASE",
            "clock": acts[n - 1]["clock"],
            "headline": ["Sprint peak crossed 31.5 km/h", "Pass mastery streak reached five",
                         "Sustained high press converted into a chance"][n - 1],
            "detail": ["Deterministic speed threshold detector",
                       "PDR ≥78 on five consecutive line-breaking passes",
                       "Final-third press siege exceeded the 30-second threshold"][n - 1],
        })
    storyboard = await foundry.recap_storyboard({
        "acts": acts,
        "milestones": milestones,
        "clock": last_state.get("clock", "—"),
        "score": last_state.get("score", {"NLA": 1, "MCS": 1}),
        "personalization": active_personalization,
    })
    storyboard["score"] = last_state.get("score", {"NLA": 1, "MCS": 1})
    storyboard["timecode"] = last_state.get("clock", "—")
    return storyboard


async def make_insight(ev: dict, metrics: dict, state: dict) -> None:
    """Stage (c) -> (d) -> (e) for one gated event, then broadcast the packet."""
    global insight_counter, last_insight_real_ts, last_ghost, latest_agent_trace
    ctx = {
        "event": ev,
        "metrics": metrics,
        "clock": state["clock"],
        "score": state["score"],
        "possession": state["possession"],
        "recent_events": [e for e in list(math.stream) if e[1] not in ("_tick",)][-8:],
        "top_inflections": top_inflections,
        "match_metadata": state.get("match_metadata"),
        "personalization": active_personalization,
    }
    stage_c = await foundry.explain(ctx)
    guardrail = None
    if stage_c.get("mode") == "azure":
        check = verify_grounding(stage_c, ev, metrics, state)
        if check["status"] == "review":
            guardrail = {
                "triggered": True,
                "action": "replaced_with_deterministic_fallback",
                "unmatched_numbers": check["unmatched_numbers"],
                "attempted_mode": "azure",
            }
            stage_c = {
                **foundry._fallback_explain(ctx),
                "mode": "fallback",
                "degraded": True,
                "model": "grounding-guard-v1",
                "agent_timings": stage_c.get("agent_timings", {}),
                "latency_ms": stage_c.get("latency_ms", 0.0),
            }
    packet = await personalizer.build_async(
        stage_c, ev, metrics, state["score"], active_personalization, state)
    insight_counter += 1
    data = {
        "id": f"insight_{insight_counter:04d}",
        "event_id": ev.get("id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model": stage_c.get("model", "deterministic-fallback-v1"),
        "archetype": stage_c.get("archetype", "rhythm_shift"),
        **packet,
    }
    ghost = data["stage_d_broadcast_overlay"].get("draw_ghost_pass") and ev.get("ghost_pass")
    if ghost:
        last_ghost = (state["t_match"] + 4.0, [ghost["x"], ghost["y"]], ghost.get("delta_xt", 0.0))
    _stamp_pipeline("c", stage_c.get("latency_ms", 0.0), {
        **(stage_c.get("stage_c_explainability") or {}),
        "mode": stage_c.get("mode", "fallback"),
        "model": stage_c.get("model"),
        "usage": foundry.status().get("usage"),
    })
    _stamp_pipeline("d", personalizer.last_d_ms, data["stage_d_broadcast_overlay"])
    _stamp_pipeline("e", personalizer.last_e_ms, data["stage_e_personalization"])
    trace = build_agent_trace(
        ev, metrics, state, stage_c, data,
        stage_b_ms=pipeline["stages"]["b"]["latency_ms"],
        stage_d_ms=personalizer.last_d_ms,
        stage_e_ms=personalizer.last_e_ms,
        gate_stats=gate_stats,
        guardrail=guardrail,
    )
    data["agent_trace"] = trace
    latest_agent_trace = trace
    gate_stats["insights"] += 1
    if stage_c.get("mode") == "azure":
        gate_stats["azure_insights"] += 1
    else:
        gate_stats["fallback_insights"] += 1
    if trace["grounding"]["status"] != "review":
        gate_stats["grounding_pass"] += 1
    insights.append(data)
    last_insight_real_ts = time.perf_counter()
    await hub.broadcast({"type": "insight", "data": data})


async def make_recap(state: dict) -> dict:
    ctx = {"top_inflections": top_inflections, "clock": state["clock"],
           "score": state["score"], "metrics": last_metrics}
    recap = await foundry.recap(ctx)
    packet = personalizer.build_recap_packet(recap, state["score"], state["clock"])
    packet["id"] = f"recap_{int(time.time())}"
    packet["created_at"] = datetime.now(timezone.utc).isoformat()
    await hub.broadcast({"type": "recap", "data": packet})
    return packet


def _insight_priority(ev: dict) -> float:
    """Rank simultaneous gated events so a signature scenario moment wins."""
    kind = ev.get("type")
    type_rank = {
        "GOAL": 100, "PRESSURE_TRAP": 88, "TACKLE": 72, "TURNOVER": 68,
        "TACTICAL_INVERSION": 80, "SHOT": 64, "PASS_COMPLETE": 26, "PASS": 30,
    }.get(kind, 18)
    scenario = 70.0 if ev.get("scenario_signature") else (12.0 if ev.get("scenario") else 0.0)
    return type_rank + scenario + min(20.0, max(0.0, (ev.get("leverage") or 0.0) * 6.0))


def _record_inflection(ev: dict) -> None:
    score = _insight_priority(ev)
    if (ev.get("leverage") or 0) < 1.0 and not ev.get("scenario_signature"):
        return
    top_inflections.append({
        "clock": ev.get("clock", "—"),
        "headline": f"{ev.get('type', 'EVENT').replace('_', ' ').title()} — "
                    f"{ev.get('player_name') or ev.get('team', '')}".strip(),
        "detail": (f"PDR {ev.get('pdr') or 0:.0f}% • ΔxT {(ev.get('delta_xt') or 0):+.2f} • "
                   f"ΔChaos {(ev.get('delta_chaos') or 0):+.2f}"),
        "leverage": max(ev.get("leverage", 0.0), round(score / 100.0, 2)),
        "scenario_signature": bool(ev.get("scenario_signature")),
    })
    top_inflections.sort(key=lambda i: -i["leverage"])
    del top_inflections[3:]


async def match_loop() -> None:
    """The heartbeat: 10Hz Stage (a) ticks; 2Hz metrics/pipeline packets."""
    global last_state, last_metrics, last_insight_real_ts, last_insight_priority, last_ghost
    global latest_ghost_counterfactual
    next_real_metrics = time.perf_counter()
    math.scenario_active = None
    event_seq = 0
    insight_candidates: List[dict] = []
    while True:
        loop_t0 = time.perf_counter()
        gate_stats["ticks"] += 1

        # ---- Stage (a): synthetic ingest --------------------------------
        t0 = time.perf_counter()
        state, raw_events = engine.tick(TICK_DT)
        last_state = state
        _stamp_pipeline("a", (time.perf_counter() - t0) * 1000.0,
                        {"clock": state["clock"], "possession": state["possession"],
                         "events": len(raw_events), "players": len(state["players"])})

        # ---- Stage (b): deterministic interpretation --------------------
        t0 = time.perf_counter()
        metrics = math.update(state, raw_events, state["t_match"],
                              state.get("scenario"), TICK_DT)
        last_metrics = metrics
        enriched = []
        for ev in raw_events:
            event_seq += 1
            ev = math.enrich(ev, state)
            ev["id"] = f"evt_{event_seq:06d}"
            enriched.append(ev)

        # Signature-trait badge registry: INCISIVE_PASS / INTERCEPT from Stage (b/c)
        for ev in enriched:
            if ev.get("type") == "PASS":
                if (ev.get("pdr") or 0) > 80 and ev.get("player_id"):
                    engine.set_badge([ev["player_id"]], "INCISIVE_PASS", 4.0)
                ghost = ev.get("ghost_pass")
                if ghost:
                    ghost_delta = float(ghost.get("delta_xt") or 0.0)
                    actual_delta = float(ev.get("delta_xt") or 0.0)
                    last_ghost = (
                        state["t_match"] + 4.0,
                        [ghost["x"], ghost["y"]],
                        ghost_delta,
                        actual_delta,
                        ghost.get("target_id"),
                        float(ghost.get("completion_probability") or 0.0),
                        float(ghost.get("net_xt_gain") or (ghost_delta - actual_delta)),
                    )
                    latest_ghost_counterfactual = {
                        "clock": ev.get("clock"),
                        "team": ev.get("team"),
                        "player_id": ev.get("player_id"),
                        "player_name": ev.get("player_name"),
                        "target_id": ghost.get("target_id"),
                        "actual_delta_xt": round(actual_delta, 3),
                        "ghost_delta_xt": round(ghost_delta, 3),
                        "net_xt_gain": round(ghost_delta - actual_delta, 3),
                        "completion_probability": ghost.get("completion_probability"),
                        "receiver_target_xy": ghost.get("receiver_target_xy"),
                    }
            elif ev.get("type") == "PRESSURE_TRAP" and ev.get("players"):
                engine.set_badge(list(ev["players"])[:3], "INTERCEPT", 4.0)
        if last_ghost and state["t_match"] < last_ghost[0]:
            state["ball"]["ghost_end"] = last_ghost[1]
            state["ball"]["ghost_delta_xt"] = round(last_ghost[2], 3)
            state["ball"]["ghost_actual_delta_xt"] = round(last_ghost[3], 3)
            state["ball"]["ghost_target_id"] = last_ghost[4]
            state["ball"]["ghost_completion_probability"] = last_ghost[5]
            state["ball"]["ghost_net_xt_gain"] = round(last_ghost[6], 3)
        elif state.get("ball"):
            state["ball"]["ghost_end"] = None
            state["ball"]["ghost_delta_xt"] = None
            state["ball"]["ghost_actual_delta_xt"] = None
            state["ball"]["ghost_target_id"] = None
            state["ball"]["ghost_completion_probability"] = None
            state["ball"]["ghost_net_xt_gain"] = None

        new_milestones = engine.milestones.update(state, enriched, metrics)
        for ev in enriched:
            _archive_event(ev, state, metrics)

        _stamp_pipeline("b", (time.perf_counter() - t0) * 1000.0,
                        {"chaos_index": metrics["chaos_index"],
                         "chaos_state": metrics["chaos_state"],
                         "delta_chaos": metrics["delta_chaos"],
                         "ppda": metrics["ppda"], "def_lines": metrics["def_lines"]})

        # ---- fan out -----------------------------------------------------
        await hub.broadcast({"type": "tick", "data": state})
        for milestone in new_milestones:
            await hub.broadcast({"type": "event", "data": milestone})
        now_real = time.perf_counter()
        if now_real >= next_real_metrics:
            next_real_metrics = now_real + 0.5
            pipeline["agent_trace"] = latest_agent_trace
            pipeline["gate"] = gate_snapshot(gate_stats)
            await hub.broadcast({"type": "metrics", "data": metrics})
            await hub.broadcast({"type": "pipeline", "data": pipeline})

        now_real = time.perf_counter()
        for ev in enriched:
            await hub.broadcast({"type": "event", "data": ev})
            _record_inflection(ev)
            gate = ev.get("ai_gate", {})
            gate_stats["events_considered"] += 1
            if gate.get("should_explain"):
                gate_stats["events_gated"] += 1
                insight_candidates.append({
                    "ev": ev, "metrics": metrics, "state": state,
                    "at": now_real, "priority": _insight_priority(ev),
                })

        # Short priority window: if a scenario signature and a normal pass land
        # in the same beat, explain the signature moment, not the pass.
        insight_candidates = [c for c in insight_candidates if now_real - c["at"] < 2.0]
        if insight_candidates:
            best = max(insight_candidates, key=lambda c: c["priority"])
            since = now_real - last_insight_real_ts
            signature = best["priority"] >= 110.0
            ready = (now_real - best["at"]) >= 0.8 or signature
            cooldown_ok = (
                since > 1.2 if signature and last_insight_priority < 100.0
                else since > (3.5 if signature else settings.min_seconds_between_insights)
            )
            if ready and cooldown_ok:
                last_insight_real_ts = now_real
                last_insight_priority = best["priority"]
                insight_candidates.clear()
                asyncio.create_task(make_insight(best["ev"], best["metrics"], best["state"]))

        # ---- hold the 10Hz cadence ---------------------------------------
        elapsed = time.perf_counter() - loop_t0
        await asyncio.sleep(max(0.001, TICK_DT - elapsed))


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(match_loop())


# --------------------------------------------------------------------- REST
def _spatial_context(team: Optional[str] = None) -> dict:
    """Live 60s spatial state for the bi-directional studio co-pilot."""
    st = last_state or {}
    players = st.get("players", [])
    if not players:
        return {}
    team = team or st.get("possession", "NLA")
    defs = [p for p in players if p["team"] == team and p["role"] == "DEF"]
    defs_sorted = sorted(defs, key=lambda p: p["y"])
    stretch = (max((p["y"] for p in defs_sorted), default=0.0)
               - min((p["y"] for p in defs_sorted), default=0.0))
    # widest seam between consecutive back-line defenders
    gap_m, gap_center, gap_defender = 0.0, {"x": 70.0, "y": 34.0}, {}
    for a, b in zip(defs_sorted, defs_sorted[1:]):
        seam = b["y"] - a["y"]
        if seam > gap_m:
            gap_m = seam
            gap_center = {"x": round((a["x"] + b["x"]) / 2, 1),
                          "y": round((a["y"] + b["y"]) / 2, 1)}
            gap_defender = {"id": b["id"], "name": b["name"]}  # defender leaving the seam
    sprinters = [p for p in players if p["role"] != "GK" and p["team"] != team]
    fastest = max(sprinters, key=lambda p: p["speed_kmh"], default=None)
    return {
        "team": team,
        "chaos_index": last_metrics.get("chaos_index", 0.5) if last_metrics else 0.5,
        "backline_stretch_m": round(stretch, 1),
        "widest_gap_m": round(gap_m, 1),
        "gap_center": gap_center,
        "gap_defender": gap_defender,
        "fastest_sprinter": dict(fastest) if fastest else {},
        "xt_at_gap": round(math.xt_value(team, gap_center["x"], gap_center["y"]), 3),
        "ghost": ({"x": last_ghost[1][0], "y": last_ghost[1][1],
                   "delta_xt": last_ghost[2], "actual_delta_xt": last_ghost[3],
                   "target_id": last_ghost[4], "completion_probability": last_ghost[5],
                   "net_xt_gain": last_ghost[6]}
                  if last_ghost and st.get("t_match", 0) < last_ghost[0] else None),
        "def_lines": last_metrics.get("def_lines", {}) if last_metrics else {},
        "ppda": last_metrics.get("ppda", {}) if last_metrics else {},
    }


async def _studio_query_handler(body: dict) -> dict:
    if not isinstance(body, dict):
        raise HTTPException(400, "JSON object body required")
    raw_query = body.get("query")
    query = raw_query.strip() if isinstance(raw_query, str) else ""
    if not query:
        raise HTTPException(400, "query is required")
    raw_locked = body.get("locked_player_id")
    locked_id = raw_locked if isinstance(raw_locked, str) else ""
    locked_team = locked_id.split("_")[0] if locked_id else None
    language = body.get("language")
    persona = body.get("persona")
    ctx = {
        "query": query,
        "language": language if isinstance(language, str) else "en",
        "persona": persona if isinstance(persona, str) else "analyst",
        "locked_player_id": locked_id or None,
        "spatial": _spatial_context(locked_team if locked_team in ("NLA", "MCS") else None),
        "metrics": last_metrics,
        "recent_events": [e for e in list(math.stream) if e[1] not in ("_tick",)][-8:],
        "top_inflections": top_inflections,
        "match_metadata": (last_state or {}).get("match_metadata"),
        "personalization": active_personalization,
    }
    result = await foundry.studio_query(ctx)
    return result


async def _tactical_war_room_handler(body: dict) -> dict:
    """Adversarial 3-agent bench negotiation over the live Stage B state."""
    body = body if isinstance(body, dict) else {}
    raw_team = body.get("team")
    team = raw_team if raw_team in ("NLA", "MCS") else None
    language = body.get("language")
    ctx = {
        "query": body.get("query") or "Run a multi-agent bench war-room on the live match state.",
        "language": language if isinstance(language, str) else "en",
        "persona": "analyst",
        "locked_player_id": body.get("locked_player_id") or None,
        "spatial": _spatial_context(team),
        "metrics": last_metrics,
        "recent_events": [e for e in list(math.stream) if e[1] not in ("_tick",)][-8:],
        "top_inflections": top_inflections,
        "match_metadata": (last_state or {}).get("match_metadata"),
        "personalization": active_personalization,
    }
    result = await foundry.tactical_war_room(ctx)
    shield = build_safety_shield(
        ctx["query"], ctx["language"], None, str(result.get("recommended_adjustment", "")))
    result["foundry_safety_shield"] = shield
    return result


@app.post("/api/studio-query")
async def studio_query(body: dict) -> dict:
    """Bi-directional 'Ask The 12th Man' agentic co-pilot."""
    return await _studio_query_handler(body)


@app.post("/api/tactical-war-room")
async def tactical_war_room(body: dict) -> dict:
    """Adversarial 3-agent bench negotiation (manager / scout / arbiter)."""
    return await _tactical_war_room_handler(body)


def _stage_b_summary(metrics: dict) -> dict:
    rows: List[dict] = []
    for entry in list(recap_archive):
        ev = entry.get("ev") or {}
        if ev.get("delta_xt") is None:
            continue
        ghost = ev.get("ghost_pass") or {}
        rows.append({
            "clock": ev.get("clock") or entry.get("clock") or "—",
            "player": ev.get("player_name") or ev.get("player_id") or "—",
            "team": ev.get("team"),
            "type": ev.get("type"),
            "delta_xt": round(float(ev.get("delta_xt") or 0.0), 3),
            "pdr": ev.get("pdr"),
            "ghost_delta_xt": ghost.get("delta_xt"),
        })
    rows.sort(key=lambda r: r["delta_xt"], reverse=True)
    history = metrics.get("chaos_history") or []
    peak_chaos = max(history) if history else metrics.get("chaos_index", 0.0)
    ghost = latest_ghost_counterfactual
    if not ghost:
        for entry in reversed(list(recap_archive)):
            ev = entry.get("ev") or {}
            candidate = ev.get("ghost_pass") or {}
            if not candidate:
                continue
            actual = float(ev.get("delta_xt") or 0.0)
            ghost_delta = float(candidate.get("delta_xt") or 0.0)
            ghost = {
                "clock": ev.get("clock") or entry.get("clock") or "—",
                "team": ev.get("team"),
                "player_id": ev.get("player_id"),
                "player_name": ev.get("player_name"),
                "target_id": candidate.get("target_id"),
                "actual_delta_xt": round(actual, 3),
                "ghost_delta_xt": round(ghost_delta, 3),
                "net_xt_gain": round(ghost_delta - actual, 3),
                "completion_probability": candidate.get("completion_probability"),
                "receiver_target_xy": candidate.get("receiver_target_xy"),
            }
            break
    return {
        "peak_chaos_index": round(float(peak_chaos or 0.0), 3),
        "team_ppda": metrics.get("ppda") or {},
        "pitch_control_split": metrics.get("pitch_control_split") or {},
        "passing_network_edges": metrics.get("passing_network_edges") or [],
        "top_delta_xt": rows[:3],
        "ghost_counterfactual": ghost,
    }


@app.get("/api/health/pipeline-audit")
async def pipeline_audit() -> dict:
    """Live 5-stage self-test: runs an isolated synthetic match tick through
    every stage and reports millisecond timings + sample outputs."""
    audit_engine = PitchForgeEngine(seed=2026, start_minute=70.0)
    audit_math = TacticalMathEngine(window_s=30.0)
    audit_math.scenario_active = None

    # warm-up so first-tick allocations don't skew the numbers
    for _ in range(25):
        st, raw = audit_engine.tick(TICK_DT)
        audit_math.update(st, raw, st["t_match"], st.get("scenario"), TICK_DT)

    reps = 30
    t_a = t_b = t_c = t_d = t_e = 0.0
    sample_event, sample_c, sample_packet = None, None, None
    for _ in range(reps):
        t0 = time.perf_counter()
        st, raw = audit_engine.tick(TICK_DT)
        t_a += (time.perf_counter() - t0) * 1000.0

        t0 = time.perf_counter()
        mets = audit_math.update(st, raw, st["t_match"], st.get("scenario"), TICK_DT)
        enriched = [audit_math.enrich(e, st) for e in raw]
        t_b += (time.perf_counter() - t0) * 1000.0

        gated = next((e for e in enriched if e["ai_gate"]["should_explain"]), None)
        t0 = time.perf_counter()
        if gated:
            ctx = {"event": gated, "metrics": mets, "clock": st["clock"],
                   "score": st["score"], "possession": st["possession"],
                   "recent_events": [], "top_inflections": []}
            stage_c = foundry._fallback_explain(ctx)
        else:
            stage_c = foundry._fallback_explain({"event": {}, "metrics": mets})
        t_c += (time.perf_counter() - t0) * 1000.0

        ev = gated or (enriched[0] if enriched else {
            "type": "PASS", "team": "NLA", "player_id": "NLA_7",
            "player_name": "J. Ardaiz", "clock": st["clock"],
            "pdr": 84.0, "delta_xt": 0.11, "ghost_pass": None, "speed_kmh": 31.0,
            "ai_gate": {"should_explain": False, "reasons": ["no gated event in audit window"]}})
        packet = personalizer.build(stage_c, ev, mets, st["score"])
        t_d += personalizer.last_d_ms
        t_e += personalizer.last_e_ms
        sample_event, sample_c, sample_packet = ev, stage_c, packet

    trace_stage_c = {
        **sample_c,
        "latency_ms": round(t_c / reps, 2),
        "mode": sample_c.get("mode", "fallback"),
    }
    sample_trace = build_agent_trace(
        sample_event, mets, st, trace_stage_c, sample_packet,
        stage_b_ms=t_b / reps,
        stage_d_ms=t_d / reps,
        stage_e_ms=t_e / reps,
        gate_stats=gate_stats,
    )
    live_metrics = last_metrics or mets
    live_state = last_state or st
    metadata = live_state.get("match_metadata") or {}
    match_summary = {
        "home": metadata.get("home", "NLA"),
        "away": metadata.get("away", "MCS"),
        "competition": metadata.get("competition", "AETHER Synthetic League"),
        "venue": metadata.get("venue", "AETHER 3D DIGITAL TWIN"),
        "clock": live_state.get("clock"),
        "score": live_state.get("score"),
        "synthetic_provenance": bool(metadata.get("synthetic", True)),
        "data_source": "Stage A deterministic 10Hz synthetic engine",
        "provenance": "No real footage, third-party broadcast marks, or external video assets.",
    }
    audit_p95 = {k: p95(v) for k, v in latency_samples.items()}
    eval_shield = build_safety_shield(
        "live pipeline audit", "en", sample_trace.get("grounding"), "")
    foundry_eval = FoundryRouter.eval_scorecard(
        grounding=sample_trace.get("grounding"),
        gate_stats={**gate_stats, "chaos_index": mets.get("chaos_index", 0.0)},
        latency_p95=audit_p95,
        shield=eval_shield,
    )
    return {
        "status": "ok",
        "synthetic_data_compliance": True,
        "match_summary": match_summary,
        "stage_b_summary": _stage_b_summary(live_metrics),
        "foundry_eval": foundry_eval,
        "foundry_safety_shield": eval_shield,
        "audit": {
            "stage_a_ingest_ms": round(t_a / reps, 3),
            "stage_b_interpret_ms": round(t_b / reps, 3),
            "stage_c_explain_ms": round(max(0.05, t_c / reps), 3),
            "stage_d_render_ms": round(t_d / reps, 3),
            "stage_e_personalize_ms": round(max(0.01, t_e / reps), 3),
        },
        "stage_modes": {
            "a": "local_live",
            "b": "local_live",
            "c": "azure_ready" if settings.azure_enabled else "local_fallback",
            "d": "local_live",
            "e": "azure_translator" if settings.translator_enabled else "local_atlas",
        },
        "stage_c_audit_mode": "deterministic_fallback",
        "azure": foundry.status(),
        "live_pipeline": {
            k: v.get("latency_ms") for k, v in pipeline["stages"].items()
        },
        "latency_p95": {k: p95(v) for k, v in latency_samples.items()},
        "agent_trace": sample_trace,
        "gate_efficiency": gate_snapshot(gate_stats),
        "handoff_counts": {
            "insights": gate_stats["insights"],
            "azure": gate_stats["azure_insights"],
            "fallback": gate_stats["fallback_insights"],
            "grounding_pass": gate_stats["grounding_pass"],
        },
        "samples": {
            "stage_a_tick": {"clock": st["clock"], "players": len(st["players"]),
                             "ball": st["ball"], "events": len(raw)},
            "stage_b_metrics": {"chaos_index": mets["chaos_index"],
                                "chaos_state": mets["chaos_state"],
                                "pdr_sample": sample_event.get("pdr"),
                                "delta_xt_sample": sample_event.get("delta_xt"),
                                "team_stats_sample": mets.get("team_stats"),
                                "leaders": mets.get("leaders")},
            "stage_c_explain": sample_c.get("stage_c_explainability"),
            "stage_c_mode": sample_c.get("mode", "fallback"),
            "stage_d_e_packet_keys": list(sample_packet.keys()),
        },
        "event_gate": {"rule": "PDR>80 OR |dChaos|>0.20 OR dxT>0.08 OR scenario",
                       "gate_fired_in_audit": sample_event.get("ai_gate")},
    }


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "stages": {
            "a": "local-pitchforge", "b": "local-numpy",
            "c": f"azure-openai:{settings.narrative_deployment}" if settings.azure_enabled
                 else "deterministic-fallback",
            "d": "local-websocket",
            "e": "azure-translator" if settings.translator_enabled else "deterministic-atlas",
        },
        "stage_c": foundry.status(),
        "clients": len(hub.clients),
        "clock": last_state.get("clock"), "score": last_state.get("score"),
        "match": {
            "id": (last_state.get("match_metadata") or {}).get("match_id"),
            "competition": (last_state.get("match_metadata") or {}).get("competition"),
            "venue": (last_state.get("match_metadata") or {}).get("venue"),
            "synthetic": True,
        },
        "team_stats": (last_metrics or {}).get("team_stats", {}),
    }


@app.get("/api/state")
async def state() -> dict:
    return {"state": last_state, "metrics": last_metrics, "pipeline": pipeline}


@app.get("/api/match-stats")
async def match_stats() -> dict:
    """Machine-readable synthetic match metadata, team stats and player leaders."""
    return {
        "match": (last_state or {}).get("match_metadata"),
        "team_stats": (last_metrics or {}).get("team_stats", {}),
        "player_stats": (last_metrics or {}).get("player_stats", {}),
        "leaders": (last_metrics or {}).get("leaders", {}),
        "clock": (last_state or {}).get("clock"),
        "score": (last_state or {}).get("score"),
        "synthetic": True,
    }


@app.get("/api/insights")
async def get_insights() -> dict:
    return {"insights": list(insights)}


@app.get("/api/personalization")
async def get_personalization() -> dict:
    return {"personalization": dict(active_personalization)}


@app.post("/api/personalization")
async def set_personalization(body: dict) -> dict:
    global active_personalization
    if body is not None and not isinstance(body, dict):
        raise HTTPException(400, "JSON object body required")
    active_personalization = personalizer.normalize_preferences(
        {**active_personalization, **(body or {})})
    return {"status": "ok", "personalization": dict(active_personalization)}


@app.get("/api/match-recap")
async def match_recap() -> dict:
    if not last_state:
        raise HTTPException(503, "Match engine not started yet")
    return await build_match_recap()


@app.post("/api/match-recap")
async def match_recap_post() -> dict:
    return await match_recap()


async def _handle_scenario(name: str) -> dict:
    if name == "halftime_recap":
        if not last_state:
            raise HTTPException(503, "Match engine not started yet")
        packet = await make_recap(last_state)
        return {"status": "ok", "scenario": name, "recap": packet}
    try:
        ack = engine.inject(name)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return ack


@app.post("/api/scenario/{name}")
async def post_scenario(name: str) -> dict:
    return await _handle_scenario(name)


@app.get("/api/scenario/{name}")
async def get_scenario(name: str) -> dict:
    return await _handle_scenario(name)


# ---------------------------------------------------------------- WebSocket
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await hub.join(ws)
    try:
        hello = {
            "type": "hello",
            "data": {
                "state": last_state, "metrics": last_metrics, "pipeline": pipeline,
                "insights": list(insights)[-8:],
            },
        }
        await ws.send_json(hello)
        while True:
            await ws.receive_text()   # keepalive pings from the studio
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await hub.leave(ws)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.host, port=settings.port)
