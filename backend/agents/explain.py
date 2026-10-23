from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Dict

from agents.roster import ARCHETYPES, pick_archetype

class ExplainMixin:

    async def explain(self, ctx: dict) -> dict:
        t0 = time.perf_counter()
        self._reset_trace()
        fallback = self._fallback_explain(ctx)
        fallback_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        if self.s.azure_enabled:
            self.last_attempted = True
            try:
                result = await asyncio.wait_for(self._azure_explain(ctx, fallback), 6.5)
                result["mode"] = "azure"
                self.last_used = True
            except Exception as exc:
                self.last_error = f"{type(exc).__name__}: {exc}"
                result = {
                    **fallback,
                    "mode": "fallback",
                    "degraded": True,
                    "agent_timings": {
                        "triage_ms": 0.0,
                        "narrative_ms": round((time.perf_counter() - t0) * 1000.0, 2),
                        "grounding_ms": 0.0,
                    },
                }
        else:
            result = {**fallback, "mode": "fallback"}
        result.setdefault("agent_timings", {
            "triage_ms": 0.0,
            "narrative_ms": fallback_ms,
            "grounding_ms": 0.0,
        })
        result["latency_ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
        return result
    async def recap(self, ctx: dict) -> dict:
        t0 = time.perf_counter()
        self._reset_trace()
        fallback = self._fallback_recap(ctx)
        if self.s.azure_enabled:
            self.last_attempted = True
            try:
                result = await asyncio.wait_for(self._azure_recap(ctx, fallback), 8.5)
                result["mode"] = "azure"
                self.last_used = True
            except Exception as exc:
                self.last_error = f"{type(exc).__name__}: {exc}"
                result = {**fallback, "mode": "fallback", "degraded": True}
        else:
            result = {**fallback, "mode": "fallback"}
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

    async def _azure_explain(self, ctx: dict, fallback: dict) -> dict:
        compact = self._compact_ctx(ctx)
        t_triage = time.perf_counter()
        triage_raw = await self._achat(
            self.s.triage_deployment,
            [{"role": "system", "content":
              "You classify football tactical moments. Reply with EXACTLY one label from: "
              + ", ".join(ARCHETYPES)},
             {"role": "user", "content": json.dumps(compact)}],
            max_tokens=10, temperature=0.0, timeout=3.0,
        )
        triage_ms = round((time.perf_counter() - t_triage) * 1000.0, 2)
        match = re.search(r"\w+", triage_raw or "")
        archetype = match.group(0) if match else fallback["archetype"]
        if archetype not in ARCHETYPES:
            archetype = fallback["archetype"]

        t_narrative = time.perf_counter()
        narrative_raw = await self._achat(
            self.s.narrative_deployment,
            [{"role": "system", "content":
              "You are an elite broadcast football analyst. Given a tactical context snapshot, "
              "return STRICT JSON only (no markdown) with keys: moment_headline (<=10 words), "
              "why_it_matters_causal (2 sentences, causal, cite the spatial numbers), "
              "tactical_catalyst (<=12 words), commentator_talking_point (1 punchy broadcast-ready sentence)."},
             {"role": "user", "content": json.dumps(compact)}],
            max_tokens=350, temperature=0.4, timeout=4.0, json_mode=True,
        )
        cleaned = re.sub(r"^```(json)?|```$", "", (narrative_raw or "").strip(), flags=re.M).strip()
        parsed = json.loads(cleaned)
        narrative_ms = round((time.perf_counter() - t_narrative) * 1000.0, 2)
        c = fallback["stage_c_explainability"]
        return {
            "archetype": archetype,
            "model": f"azure-foundry:{self.s.narrative_deployment}+{self.s.triage_deployment}",
            "agent_timings": {
                "triage_ms": triage_ms,
                "narrative_ms": narrative_ms,
                "grounding_ms": 0.0,
            },
            "stage_c_explainability": {
                "moment_headline": str(parsed.get("moment_headline") or c["moment_headline"]),
                "why_it_matters_causal": str(parsed.get("why_it_matters_causal") or c["why_it_matters_causal"]),
                "tactical_catalyst": str(parsed.get("tactical_catalyst") or c["tactical_catalyst"]),
                "commentator_talking_point": str(parsed.get("commentator_talking_point") or c["commentator_talking_point"]),
            },
        }

    async def _azure_recap(self, ctx: dict, fallback: dict) -> dict:
        raw = await self._achat(
            self.s.narrative_deployment,
            [{"role": "system", "content":
              "You are a studio broadcast producer. Compile the top-3 match inflection points into "
              "STRICT JSON only: {\"title\": str, \"items\": [{\"clock\": str, \"headline\": str, \"detail\": str} x3]}."},
             {"role": "user", "content": json.dumps(self._compact_ctx(ctx))}],
            max_tokens=500, temperature=0.5, timeout=5.0, json_mode=True,
        )
        cleaned = re.sub(r"^```(json)?|```$", "", (raw or "").strip(), flags=re.M).strip()
        parsed = json.loads(cleaned)
        items = parsed.get("items") or fallback["items"]
        return {"title": str(parsed.get("title") or fallback["title"]), "items": items[:3],
                "model": f"azure-foundry:{self.s.narrative_deployment}"}

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
        team_stats = (m.get("team_stats") or {}).get(team, {})
        pass_acc = team_stats.get("pass_accuracy", 0.0)
        shots = team_stats.get("shots", 0)

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
                    f"variance stays low, so possession is circulating without fracturing at "
                    f"{pass_acc:.1f}% pass accuracy across {shots} shots. "
                    f"Chaos Index {chaos:.2f} — the block is doing its job."),
                "tactical_catalyst": f"Low turnover rate; {pass_acc:.1f}% completion; compact unit spacing",
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

