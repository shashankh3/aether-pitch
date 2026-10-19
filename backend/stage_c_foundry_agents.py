"""
AETHER PITCH — Stage (c): Causal Explainability via Multi-Model Routing
=======================================================================
Azure AI Foundry multi-agent router:

  * Fast Triage Agent      (gpt-4o-mini / Phi-3.5-mini) — classifies the
    tactical archetype in <250ms.
  * Causal Narrative Agent (gpt-4o / Llama-3.3-70B)      — explains WHY the
    moment matters by linking the preceding 15s of spatial drift to the event.
  * Studio Recap Agent — compiles the top-3 inflection points into a
    halftime/full-time broadcast recap.

If Azure credentials are not configured (or a call fails/timeouts), a
deterministic high-precision fallback generator produces the same strict JSON
schema so the app runs out-of-the-box during local development and judging.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Any, Dict, List, Optional

import requests

from config import settings

ARCHETYPES = (
    "counter_overload", "pressing_trap", "inversion",
    "difficult_progression", "threat_surge", "rhythm_shift",
)


def pick_archetype(ev: Optional[dict], metrics: dict) -> str:
    ev = ev or {}
    sc = ev.get("scenario")
    if sc == "chaos_counter":
        return "counter_overload"
    if sc == "high_press_turnover" or ev.get("type") == "PRESSURE_TRAP":
        return "pressing_trap"
    if sc == "tactical_inversion" or ev.get("type") == "TACTICAL_INVERSION":
        return "inversion"
    if ev.get("type") in ("PASS", "SHOT") and (ev.get("pdr") or 0) > 80:
        return "difficult_progression"
    if (ev.get("delta_xt") or 0) > 0.08:
        return "threat_surge"
    if metrics.get("chaos_state") == "HIGH CHAOS TRANSITION":
        return "counter_overload"
    return "rhythm_shift"


class FoundryRouter:
    def __init__(self, cfg=settings):
        self.s = cfg

    # ------------------------------------------------------------- public API
    async def explain(self, ctx: dict) -> dict:
        t0 = time.perf_counter()
        fallback = self._fallback_explain(ctx)
        if self.s.azure_enabled:
            try:
                result = await asyncio.wait_for(self._azure_explain(ctx, fallback), 6.0)
            except Exception:
                result = fallback
        else:
            result = fallback
        result["latency_ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
        return result

    async def recap(self, ctx: dict) -> dict:
        t0 = time.perf_counter()
        fallback = self._fallback_recap(ctx)
        if self.s.azure_enabled:
            try:
                result = await asyncio.wait_for(self._azure_recap(ctx, fallback), 8.0)
            except Exception:
                result = fallback
        else:
            result = fallback
        result["latency_ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
        return result

    # ----------------------------------------------------------- Azure calls
    def _chat(self, deployment: str, messages: List[dict],
              max_tokens: int = 400, temperature: float = 0.2) -> str:
        url = (f"{self.s.azure_openai_endpoint.rstrip('/')}/openai/deployments/"
               f"{deployment}/chat/completions?api-version={self.s.azure_openai_api_version}")
        r = requests.post(
            url,
            headers={"api-key": self.s.azure_openai_key, "Content-Type": "application/json"},
            json={"messages": messages, "max_tokens": max_tokens, "temperature": temperature},
            timeout=10,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    async def _azure_explain(self, ctx: dict, fallback: dict) -> dict:
        compact = self._compact_ctx(ctx)
        triage_raw = await asyncio.to_thread(
            self._chat, self.s.triage_deployment,
            [{"role": "system", "content":
              "You classify football tactical moments. Reply with EXACTLY one label from: "
              + ", ".join(ARCHETYPES)},
             {"role": "user", "content": json.dumps(compact)}],
            max_tokens=10, temperature=0.0,
        )
        match = re.search(r"\w+", triage_raw or "")
        archetype = match.group(0) if match else fallback["archetype"]
        if archetype not in ARCHETYPES:
            archetype = fallback["archetype"]

        narrative_raw = await asyncio.to_thread(
            self._chat, self.s.narrative_deployment,
            [{"role": "system", "content":
              "You are an elite broadcast football analyst. Given a tactical context snapshot, "
              "return STRICT JSON only (no markdown) with keys: moment_headline (<=10 words), "
              "why_it_matters_causal (2 sentences, causal, cite the spatial numbers), "
              "tactical_catalyst (<=12 words), commentator_talking_point (1 punchy broadcast-ready sentence)."},
             {"role": "user", "content": json.dumps(compact)}],
            max_tokens=350, temperature=0.4,
        )
        cleaned = re.sub(r"^```(json)?|```$", "", (narrative_raw or "").strip(), flags=re.M).strip()
        parsed = json.loads(cleaned)
        c = fallback["stage_c_explainability"]
        return {
            "archetype": archetype,
            "model": f"azure-foundry:{self.s.narrative_deployment}+{self.s.triage_deployment}",
            "stage_c_explainability": {
                "moment_headline": str(parsed.get("moment_headline") or c["moment_headline"]),
                "why_it_matters_causal": str(parsed.get("why_it_matters_causal") or c["why_it_matters_causal"]),
                "tactical_catalyst": str(parsed.get("tactical_catalyst") or c["tactical_catalyst"]),
                "commentator_talking_point": str(parsed.get("commentator_talking_point") or c["commentator_talking_point"]),
            },
        }

    async def _azure_recap(self, ctx: dict, fallback: dict) -> dict:
        raw = await asyncio.to_thread(
            self._chat, self.s.narrative_deployment,
            [{"role": "system", "content":
              "You are a studio broadcast producer. Compile the top-3 match inflection points into "
              "STRICT JSON only: {\"title\": str, \"items\": [{\"clock\": str, \"headline\": str, \"detail\": str} x3]}."},
             {"role": "user", "content": json.dumps(self._compact_ctx(ctx))}],
            max_tokens=500, temperature=0.5,
        )
        cleaned = re.sub(r"^```(json)?|```$", "", (raw or "").strip(), flags=re.M).strip()
        parsed = json.loads(cleaned)
        items = parsed.get("items") or fallback["items"]
        return {"title": str(parsed.get("title") or fallback["title"]), "items": items[:3],
                "model": f"azure-foundry:{self.s.narrative_deployment}"}

    @staticmethod
    def _compact_ctx(ctx: dict) -> dict:
        ev = ctx.get("event") or {}
        m = ctx.get("metrics") or {}
        return {
            "clock": ctx.get("clock"),
            "score": ctx.get("score"),
            "possession": ctx.get("possession"),
            "event": {k: ev.get(k) for k in (
                "type", "team", "player_name", "start", "end", "distance_m",
                "ball_speed_kmh", "defenders_in_cone", "nearest_defender_m",
                "pdr", "delta_xt", "delta_chaos", "speed_kmh", "scenario",
                "line_breaking", "ghost_pass", "reason") if k in ev},
            "metrics": {k: m.get(k) for k in (
                "chaos_index", "chaos_state", "delta_chaos", "ppda", "def_lines",
                "pressing_intensity", "turnover_rate", "stretch_m")},
            "recent_events": ctx.get("recent_events", [])[:8],
            "top_inflections": ctx.get("top_inflections", []),
        }

    # -------------------------------------------------- deterministic fallback
    def _fallback_explain(self, ctx: dict) -> dict:
        ev = ctx.get("event") or {}
        m = ctx.get("metrics") or {}
        archetype = pick_archetype(ev, m)
        team = ev.get("team") or ctx.get("possession") or "NLA"
        opp = "MCS" if team == "NLA" else "NLA"
        player = ev.get("player_name") or "the ball carrier"
        pdr = ev.get("pdr")
        dxt = ev.get("delta_xt") or 0.0
        dc = ev.get("delta_chaos", m.get("delta_chaos", 0.0))
        chaos = m.get("chaos_index", 0.5)
        lines = m.get("def_lines", {})
        line_m = lines.get(opp, 40.0)
        ghost = ev.get("ghost_pass") or {}
        speed = ev.get("speed_kmh") or ev.get("ball_speed_kmh") or 0.0

        if archetype == "counter_overload":
            c = {
                "moment_headline": "High-Chaos Counter Rips Through the Broken Line",
                "why_it_matters_causal": (
                    f"Because {opp} lost the ball in the middle third seconds ago, {team} sprang a "
                    f"transition at {speed:.1f} km/h while the defensive line sat at {line_m:.0f} m. "
                    f"The Chaos Index jumped {dc:+.2f} in 10 s, so the structure fractured before "
                    f"the press could reset."),
                "tactical_catalyst": f"Chaos Index {dc:+.2f} in 10 s; line exposed at {line_m:.0f} m",
                "commentator_talking_point": (
                    f"Watch {player} go — the second that turnover happened it was a footrace, and "
                    f"at {speed:.1f} km/h there is nobody catching them."),
            }
        elif archetype == "pressing_trap":
            c = {
                "moment_headline": "Coordinated Pressing Trap Strangles the Buildup",
                "why_it_matters_causal": (
                    f"Three {opp} defenders collapsed within 6 m of the carrier, forcing the turnover "
                    f"with {team} still set to play out. Chaos sits at {chaos:.2f} and the trap "
                    f"converted position into a shot-worthy field position instantly."),
                "tactical_catalyst": f"3+ defenders inside 6 m; PPDA {m.get('ppda', {}).get(opp, 0):.1f}",
                "commentator_talking_point": (
                    f"See the triangle close — that is a rehearsed trap, not a scramble. "
                    f"The moment {player} took the first touch, the exit was already shut."),
            }
        elif archetype == "inversion":
            c = {
                "moment_headline": "Inverted Fullback Rebuilds the Midfield Block",
                "why_it_matters_causal": (
                    f"{player} has tucked into central midfield, overloading the first phase of "
                    f"buildup and stretching {opp}'s resting shape. The trade-off is real: the "
                    f"flank he abandoned is the space a counter will target."),
                "tactical_catalyst": "Right-back inverted; flank vacated on the far side",
                "commentator_talking_point": (
                    f"Number 2 is playing in midfield now — extra man in the build-up, but keep one "
                    f"eye on the channel he just vacated."),
            }
        elif archetype == "difficult_progression":
            c = {
                "moment_headline": "High-Wire Pass Threads the Press",
                "why_it_matters_causal": (
                    f"{player} attempted a {pdr:.0f}%-difficulty progression through {ev.get('defenders_in_cone', 1)} "
                    f"defenders in the passing cone — highest-risk category. It bypassed an entire "
                    f"unit for {dxt:+.2f} xT, which is why the Chaos needle twitched {dc:+.2f}."),
                "tactical_catalyst": f"PDR {pdr:.1f}% with ΔxT {dxt:+.2f}",
                "commentator_talking_point": (
                    f"That is an 80-plus difficulty ball — one misjudged touch and it's a counter "
                    f"the other way. {player} took the gamble and it stuck."),
            }
        elif archetype == "threat_surge":
            c = {
                "moment_headline": "Expected Threat Surges Into the Final Third",
                "why_it_matters_causal": (
                    f"The ball moved into a zone worth {dxt:+.2f} xT more than the last touchpoint, "
                    f"dragging {opp}'s block {m.get('stretch_m', 0):.0f} m out of shape. Control is "
                    f"tilting: Chaos Index now {chaos:.2f}."),
                "tactical_catalyst": f"ΔxT {dxt:+.2f}; defensive stretch {m.get('stretch_m', 0):.0f} m",
                "commentator_talking_point": (
                    f"Every metre closer to goal doubles the danger — {player} just found the "
                    f"pocket where the entire pitch opens up."),
            }
        else:  # rhythm_shift
            c = {
                "moment_headline": "Rhythm Holds: Structured Control Dominates",
                "why_it_matters_causal": (
                    f"Turnover rate is {m.get('turnover_rate', 0):.1f} per minute and ball-speed "
                    f"variance stays low, so possession is circulating without fracturing. "
                    f"Chaos Index {chaos:.2f} — the block is doing its job."),
                "tactical_catalyst": "Low turnover rate; compact unit spacing",
                "commentator_talking_point": (
                    f"Patient, lateral, controlled — {team} are inviting the press precisely so they "
                    f"can play through it."),
            }
        return {"archetype": archetype, "model": "deterministic-fallback-v1",
                "stage_c_explainability": c}

    def _fallback_recap(self, ctx: dict) -> dict:
        infl = ctx.get("top_inflections") or []
        items = []
        for i, inf in enumerate(infl[:3], 1):
            items.append({
                "clock": inf.get("clock", "—"),
                "headline": inf.get("headline", f"Inflection moment {i}"),
                "detail": inf.get("detail", "High-leverage swing detected by the deterministic gate."),
            })
        while len(items) < 3:
            items.append({"clock": "—", "headline": "Phase of sustained control",
                          "detail": "The entropy curve stayed inside the structured band."})
        return {
            "title": "Studio Recap — Three Moments That Shaped the Match",
            "items": items,
            "model": "deterministic-fallback-v1",
        }
