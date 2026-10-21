"""
AETHER PITCH — Stage (c): Causal Explainability via Multi-Model Routing
=======================================================================
Azure AI Foundry-hosted two-stage router:

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
from typing import Dict, List, Optional

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

    async def recap_storyboard(self, ctx: dict) -> dict:
        """Compile the v5.0 three-act storyboard with dual-persona + i18n copy."""
        t0 = time.perf_counter()
        raw_acts = (ctx.get("acts") or [])[:3]
        milestones = ctx.get("milestones") or []
        acts = []
        for i, raw in enumerate(raw_acts, 1):
            n = int(raw.get("act") or i)
            title = str(raw.get("title") or f"Act {n}")
            subtitle = str(raw.get("subtitle") or "Tactical inflection")
            clock = str(raw.get("clock") or "—")
            team = raw.get("team") or "NLA"
            player = raw.get("player_name") or "the ball carrier"
            pdr = float(raw.get("pdr") or 0.0)
            dxt = float(raw.get("delta_xt") or 0.0)
            chaos = float(raw.get("chaos") or 0.0)
            event_type = str(raw.get("event_type") or "PASS")
            ghost = raw.get("ghost_pass") or {}
            actual = raw.get("actual_pass") or {}
            catalyst = str(raw.get("catalyst") or
                          f"{event_type.replace('_', ' ').title()} • PDR {pdr:.0f}% • ΔxT {dxt:+.2f}")
            localized = self._localize_act(
                n, title, subtitle, clock, team, player, pdr, dxt, chaos, catalyst)
            analyst = (
                f"Act {n} — {title}. {subtitle}. At {clock}, {player} ({team}) produced "
                f"{pdr:.0f}% pass difficulty for {dxt:+.2f} xT while the Chaos Index sat at "
                f"{chaos:.2f}. The alternative ghost lane to {ghost.get('target_id') or 'the free man'} "
                f"offered {float(ghost.get('delta_xt') or 0.0):+.2f} xT."
            )
            casual = (
                f"Act {n}: {title}! {player} lit up {clock} with a moment the whole stadium felt — "
                f"{pdr:.0f}% difficulty, {dxt:+.2f} expected threat, and chaos at {chaos:.2f}. "
                f"{subtitle}."
            )
            acts.append({
                **raw,
                "act": n,
                "analyst_tactical_summary": analyst,
                "casual_story": casual,
                "localized_commentary": localized,
                "catalyst": catalyst,
                "actual_pass": actual,
                "ghost_pass": ghost,
                "key_player_ids": (raw.get("key_player_ids") or [])[:3],
            })
        while len(acts) < 3:
            n = len(acts) + 1
            acts.append({
                "act": n,
                "title": f"Act {n}",
                "subtitle": "The tactical pattern held",
                "clock": "—",
                "event_type": "STRUCTURE",
                "team": "NLA",
                "pdr": 0.0,
                "delta_xt": 0.0,
                "chaos": 0.0,
                "actual_pass": {},
                "ghost_pass": {},
                "key_player_ids": [],
                "analyst_tactical_summary": "The deterministic engine found no further high-leverage swing.",
                "casual_story": "The match settled into a tense, tactical rhythm.",
                "localized_commentary": {
                    "en": "The match settled into a tense, tactical rhythm.",
                    "es": "El partido entró en un ritmo táctico y tenso.",
                    "ar": "استقرت المباراة في إيقاع تكتيكي متوتر.",
                    "hi": "मैच एक तनावपूर्ण रणनीतिक लय में आ गया।",
                },
            })
        return {
            "title": "The Championship Finale — Three Acts That Decided It",
            "subtitle": "Milestone Engine • Ghost-Pass Counterfactuals • Dual-Persona Storyboard",
            "acts": acts,
            "milestones": milestones[:3],
            "model": "aether-recap-storyboard-v5",
            "latency_ms": round((time.perf_counter() - t0) * 1000.0, 1),
        }

    @staticmethod
    def _localize_act(n: int, title: str, subtitle: str, clock: str, team: str,
                      player: str, pdr: float, dxt: float, chaos: float,
                      catalyst: str) -> Dict[str, str]:
        return {
            "en": (f"Act {n} — {title}. {subtitle}. At {clock}, {player} produced {pdr:.0f}% "
                   f"pass difficulty for {dxt:+.2f} xT as chaos held at {chaos:.2f}. {catalyst}"),
            "es": (f"Acto {n} — {title}. {subtitle}. En {clock}, {player} generó {pdr:.0f}% de "
                   f"dificultad de pase y {dxt:+.2f} xT con el caos en {chaos:.2f}. {catalyst}"),
            "ar": (f"الفصل {n} — {title}. {subtitle}. في {clock}، صنع {player} تمريرة بصعوبة "
                   f"{pdr:.0f}% و{dxt:+.2f} xT بينما استقرت الفوضى عند {chaos:.2f}. {catalyst}"),
            "hi": (f"अंक {n} — {title}. {subtitle}. {clock} पर {player} ने {pdr:.0f}% पास कठिनाई "
                   f"के साथ {dxt:+.2f} xT बनाया, जब कैओस {chaos:.2f} था। {catalyst}"),
        }

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
                    f"Three {team} defenders collapsed within 6 m of the {opp} carrier, forcing the "
                    f"turnover with {opp} still set to play out. Chaos sits at {chaos:.2f} and the "
                    f"trap converted position into a shot-worthy field position instantly."),
                "tactical_catalyst": f"3+ defenders inside 6 m; PPDA {m.get('ppda', {}).get(team, 0):.1f}",
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
                    "Number 2 is playing in midfield now — extra man in the build-up, but keep one "
                    "eye on the channel he just vacated."),
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

    # ---------------------------------------------------- bi-directional co-pilot
    async def studio_query(self, ctx: dict) -> dict:
        """'Ask The 12th Man' — bi-directional agentic studio co-pilot.

        ctx: {query, language, persona, locked_player_id, spatial: {...computed
        live 60s spatial state...}, recent_events, metrics}
        Returns the strict StudioQueryResponse schema with a scene_directive
        that physically drives the 3D pitch / camera / telestrator overlays.
        """
        fallback = self._studio_query_fallback(ctx)
        if self.s.azure_enabled:
            try:
                raw = await asyncio.wait_for(
                    asyncio.to_thread(self._azure_studio_query, ctx, fallback), 8.0
                )
                # structural guard: fall back if the model dropped required keys
                required = ("agent_reasoning_chain", "studio_answer_localized",
                            "commentator_cue_15s", "scene_directive")
                if all(k in raw for k in required):
                    raw.setdefault("query", ctx.get("query", ""))
                    raw.setdefault("model", f"azure-foundry:{self.s.narrative_deployment}")
                    raw["scene_directive"] = {**fallback["scene_directive"], **raw["scene_directive"]}
                    return raw
            except Exception:
                pass
        return fallback

    def _azure_studio_query(self, ctx: dict, fallback: dict) -> dict:
        raw = self._chat(
            self.s.narrative_deployment,
            [{"role": "system", "content":
              "You are The 12th Man, an agentic broadcast studio co-pilot wired into a live "
              "3D tactical engine. Given the query and the live 60s spatial telemetry, return "
              "STRICT JSON only (no markdown) with keys: "
              "agent_reasoning_chain (array of exactly 3 short reasoning steps citing the numbers), "
              "studio_answer_localized (2-3 sentences in the requested language), "
              "commentator_cue_15s (one punchy 15-second commentator line), "
              "scene_directive (object with keys camera_mode in [TELE_BROADCAST, TACTICAL_DRONE, "
              "PLAYER_LOCK_3RD_PERSON, ACTION_ZOOM], spotlight_player_ids (<=3 ids), "
              "enable_offside_wall (bool), enable_compactness_polygon (bool), draw_ghost_pass (bool), "
              "highlight_pitch_zone ({x_min,x_max,y_min,y_max,label}) using the provided spatial stats."},
             {"role": "user", "content": json.dumps(self._compact_ctx(ctx))}],
            max_tokens=550, temperature=0.4,
        )
        cleaned = re.sub(r"^```(json)?|```$", "", (raw or "").strip(), flags=re.M).strip()
        return json.loads(cleaned)

    def _studio_query_fallback(self, ctx: dict) -> dict:
        """Zero-latency deterministic tactical reasoning over the live 60s window."""
        sp = ctx.get("spatial") or {}
        language = ctx.get("language", "en")
        team = sp.get("team") or "NLA"
        opp = "MCS" if team == "NLA" else "NLA"
        stretch = sp.get("backline_stretch_m", 0.0)
        gap_m = sp.get("widest_gap_m", 0.0)
        gap_center = sp.get("gap_center", {"x": 70.0, "y": 34.0})
        gap_defender = sp.get("gap_defender") or {}
        sprinter = sp.get("fastest_sprinter") or {}
        ghost = sp.get("ghost") or {}
        chaos = sp.get("chaos_index", 0.5)

        chain = [
            (f"Scanned {team} back-line coordinates: lateral stretch is {stretch:.1f}m "
             f"(threshold: 30.0m); widest seam between defenders is {gap_m:.1f}m."),
            (f"Isolated the void at pitch zone ({gap_center['x']:.1f}, {gap_center['y']:.1f}) — "
             f"left exposed by {gap_defender.get('name', 'the far-sided defender')} "
             f"({gap_defender.get('id', '—')}) stepping inside."),
            (f"Cross-referenced {opp} runners: #{sprinter.get('shirt_number', '—')} "
             f"{sprinter.get('name', '—')} is the fastest threat at "
             f"{sprinter.get('speed_kmh', 0.0):.1f} km/h attacking that channel"
             + (f" (ghost alternative worth +{ghost.get('delta_xt', 0):.2f} xT)." if ghost else "."))
        ]
        if chaos > 0.68:
            chain.append("")  # keep chain at exactly 3 steps in the UI
        chain = [c for c in chain if c][:3]

        answers = {
            "en": (f"{team}'s back line is stretched {stretch:.1f} m and the widest seam between "
                   f"defenders is {gap_m:.1f} m at zone ({gap_center['x']:.0f}, {gap_center['y']:.0f}). "
                   f"{opp}'s #{sprinter.get('shirt_number', '—')} {sprinter.get('name', '—')} is already "
                   f"running at {sprinter.get('speed_kmh', 0):.1f} km/h to attack that exact channel."),
            "es": (f"La línea defensiva de {team} está estirada {stretch:.1f} m y la brecha más amplia "
                   f"entre defensores es de {gap_m:.1f} m en la zona ({gap_center['x']:.0f}, {gap_center['y']:.0f}). "
                   f"#{sprinter.get('shirt_number', '—')} {sprinter.get('name', '—')} de {opp} ya corre a "
                   f"{sprinter.get('speed_kmh', 0):.1f} km/h para atacar ese pasillo."),
            "ar": (f"خط {team} الدفاعي متمدد بمسافة {stretch:.1f} متر، وأوسع فجوة بين المدافعين "
                   f"{gap_m:.1f} متر عند المنطقة ({gap_center['x']:.0f}, {gap_center['y']:.0f}). "
                   f"اللاعب #{sprinter.get('shirt_number', '—')} {sprinter.get('name', '—')} من {opp} "
                   f"ينطلق بسرعة {sprinter.get('speed_kmh', 0):.1f} كم/س لاستغلال تلك المساحة."),
            "hi": (f"{team} की बैक-लाइन {stretch:.1f} m फैली हुई है और रक्षकों के बीच सबसे बड़ी खाई "
                   f"{gap_m:.1f} m की है ज़ोन ({gap_center['x']:.0f}, {gap_center['y']:.0f}) पर। "
                   f"{opp} का #{sprinter.get('shirt_number', '—')} {sprinter.get('name', '—')} "
                   f"{sprinter.get('speed_kmh', 0):.1f} km/h की रफ़्तार से उसी गलियारे पर हमला कर रहा है।"),
        }
        zone_half_x, zone_half_y = max(8.0, gap_m * 0.6), max(7.0, gap_m * 0.5)
        return {
            "query": ctx.get("query", ""),
            "agent_reasoning_chain": chain,
            "studio_answer_localized": answers.get(language, answers["en"]),
            "commentator_cue_15s": (
                f"Keep your eyes on the pocket of space at ({gap_center['x']:.0f}, {gap_center['y']:.0f}) — "
                f"one switch of play and #{sprinter.get('shirt_number', '—')} is clean through!"),
            "scene_directive": {
                "camera_mode": "TACTICAL_DRONE",
                "spotlight_player_ids": [
                    pid for pid in [
                        gap_defender.get("id"),
                        sprinter.get("id"),
                        ghost.get("target_id"),
                    ] if pid
                ][:3],
                "enable_offside_wall": True,
                "enable_compactness_polygon": True,
                "draw_ghost_pass": True,
                "highlight_pitch_zone": {
                    "x_min": round(max(0.0, gap_center["x"] - zone_half_x), 1),
                    "x_max": round(min(105.0, gap_center["x"] + zone_half_x), 1),
                    "y_min": round(max(0.0, gap_center["y"] - zone_half_y), 1),
                    "y_max": round(min(68.0, gap_center["y"] + zone_half_y), 1),
                    "label": f"{gap_m:.1f}m DEFENSIVE SEAM",
                },
            },
            "model": "deterministic-fallback-v1",
        }
