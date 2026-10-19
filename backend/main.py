"""
AETHER PITCH — Studio Engine (FastAPI orchestrator)
===================================================
Runs the full 5-stage pipeline on one event loop and broadcasts over WebSocket:

  Stage (a) Ingest     — PitchForge 10Hz synthetic tracking + auto-events
  Stage (b) Interpret  — deterministic math: Chaos Index, PDR, ΔxT, ghost passes
  Stage (c) Explain    — Azure AI Foundry multi-agent causal reasoning (fallback: local)
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
import json
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from stage_a_synthetic_engine import PitchForgeEngine
from stage_b_math_engine import TacticalMathEngine
from stage_c_foundry_agents import FoundryRouter
from stage_d_e_personalizer import Personalizer

TICK_DT = 1.0 / settings.tick_rate_hz          # 0.1 s sim step per tick

app = FastAPI(title="AETHER PITCH — Studio Engine", version="1.0.0")
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
insights: deque = deque(maxlen=40)
top_inflections: List[dict] = []
pipeline: Dict[str, Any] = {
    "stages": {k: {"latency_ms": 0.0} for k in "abcde"},
    "payloads": {k: "" for k in "abcde"},
    "updated_at": None,
}
insight_counter = 0
last_insight_real_ts = 0.0


def _stamp_pipeline(stage: str, latency_ms: float, payload: Any) -> None:
    pipeline["stages"][stage]["latency_ms"] = round(latency_ms, 2)
    try:
        pipeline["payloads"][stage] = json.dumps(payload, default=str)[:900]
    except Exception:
        pipeline["payloads"][stage] = str(payload)[:900]
    pipeline["updated_at"] = datetime.now(timezone.utc).isoformat()


async def make_insight(ev: dict, metrics: dict, state: dict) -> None:
    """Stage (c) -> (d) -> (e) for one gated event, then broadcast the packet."""
    global insight_counter, last_insight_real_ts
    ctx = {
        "event": ev,
        "metrics": metrics,
        "clock": state["clock"],
        "score": state["score"],
        "possession": state["possession"],
        "recent_events": [e for e in list(math.stream) if e[1] not in ("_tick",)][-8:],
        "top_inflections": top_inflections,
    }
    stage_c = await foundry.explain(ctx)
    packet = await personalizer.build_async(stage_c, ev, metrics, state["score"])
    insight_counter += 1
    data = {
        "id": f"insight_{insight_counter:04d}",
        "event_id": ev.get("id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model": stage_c.get("model", "deterministic-fallback-v1"),
        "archetype": stage_c.get("archetype", "rhythm_shift"),
        **packet,
    }
    insights.append(data)
    last_insight_real_ts = time.perf_counter()
    _stamp_pipeline("c", stage_c.get("latency_ms", 0.0), stage_c.get("stage_c_explainability"))
    _stamp_pipeline("d", 0.4, data["stage_d_broadcast_overlay"])
    _stamp_pipeline("e", 0.6, data["stage_e_personalization"])
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


def _record_inflection(ev: dict) -> None:
    if (ev.get("leverage") or 0) < 1.0:
        return
    top_inflections.append({
        "clock": ev.get("clock", "—"),
        "headline": f"{ev.get('type', 'EVENT').replace('_', ' ').title()} — "
                    f"{ev.get('player_name') or ev.get('team', '')}".strip(),
        "detail": (f"PDR {ev.get('pdr') or 0:.0f}% • ΔxT {(ev.get('delta_xt') or 0):+.2f} • "
                   f"ΔChaos {(ev.get('delta_chaos') or 0):+.2f}"),
        "leverage": ev.get("leverage", 0.0),
    })
    top_inflections.sort(key=lambda i: -i["leverage"])
    del top_inflections[3:]


async def match_loop() -> None:
    """The heartbeat: 10Hz Stage (a) ticks; 2Hz metrics/pipeline packets."""
    global last_state, last_metrics, last_insight_real_ts
    next_real_metrics = time.perf_counter()
    math.scenario_active = None
    event_seq = 0
    while True:
        loop_t0 = time.perf_counter()

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
        _stamp_pipeline("b", (time.perf_counter() - t0) * 1000.0,
                        {"chaos_index": metrics["chaos_index"],
                         "chaos_state": metrics["chaos_state"],
                         "delta_chaos": metrics["delta_chaos"],
                         "ppda": metrics["ppda"], "def_lines": metrics["def_lines"]})

        # ---- fan out -----------------------------------------------------
        await hub.broadcast({"type": "tick", "data": state})
        now_real = time.perf_counter()
        if now_real >= next_real_metrics:
            next_real_metrics = now_real + 0.5
            await hub.broadcast({"type": "metrics", "data": metrics})
            await hub.broadcast({"type": "pipeline", "data": pipeline})

        for ev in enriched:
            await hub.broadcast({"type": "event", "data": ev})
            _record_inflection(ev)
            gate = ev.get("ai_gate", {})
            if gate.get("should_explain"):
                if (time.perf_counter() - last_insight_real_ts) > settings.min_seconds_between_insights:
                    last_insight_real_ts = time.perf_counter()
                    asyncio.create_task(make_insight(ev, metrics, state))

        # ---- hold the 10Hz cadence ---------------------------------------
        elapsed = time.perf_counter() - loop_t0
        await asyncio.sleep(max(0.001, TICK_DT - elapsed))


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(match_loop())


# --------------------------------------------------------------------- REST
@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "stages": {
            "a": "local-pitchforge", "b": "local-numpy",
            "c": f"azure-foundry:{settings.narrative_deployment}" if settings.azure_enabled
                 else "deterministic-fallback",
            "d": "azure-webpubsub" if settings.webpubsub_enabled else "local-websocket",
            "e": "azure-translator" if settings.translator_enabled else "deterministic-atlas",
        },
        "clients": len(hub.clients),
        "clock": last_state.get("clock"), "score": last_state.get("score"),
    }


@app.get("/api/state")
async def state() -> dict:
    return {"state": last_state, "metrics": last_metrics, "pipeline": pipeline}


@app.get("/api/insights")
async def get_insights() -> dict:
    return {"insights": list(insights)}


async def _handle_scenario(name: str) -> dict:
    global top_inflections
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
