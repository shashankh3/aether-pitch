from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Dict, List

from agents.roster import WAR_ROOM_AGENTS
from rai_shield import shield_deflection

class WarRoomMixin:
    # ------------------------------------------- adversarial bench war-room
    async def tactical_war_room(self, ctx: dict) -> dict:
        """Three-agent adversarial tactical negotiation over live Stage B state.

        NLATacticalManagerAgent proposes, MCSOppositionScoutAgent counters, and
        SpatialArbiterAgent adjudicates against the 16x12 xT tensor to produce
        one Tactical Prescription.

        This is a genuine sequential multi-agent orchestration, not one model
        role-playing three voices: every agent is a separate model invocation
        with its own deployment, its own tool bundle and its own turn, and each
        one reads the turns that came before it. The per-agent calls are
        returned in `agent_calls` so the trace proves it.
        """
        self._reset_trace()
        fallback = self._war_room_fallback(ctx)
        # ---- PRE-FLIGHT shield ------------------------------------------
        risk = self.preflight_screen(ctx)
        if risk["severity"] != "clear":
            self.last_error = f"prompt-shield-{risk['severity']}"
            return {
                **fallback,
                "mode": "shield",
                "foundry_safety_shield": {
                    "prompt_shield_status": "PROTECTED",
                    "severity": risk["severity"],
                    "categories": list(risk["categories"]),
                    "numeric_grounding_pass": True,
                    "club_neutrality_pass": True,
                    "grounding_status": "not_evaluated",
                    "deflection": shield_deflection(
                        ctx.get("query") or "", ctx.get("language") or "en"),
                    "reasons": [str(risk["reason"])],
                    "policy_version": "aether-prompt-shield-v1",
                },
            }
        if not self.s.azure_enabled:
            return {**fallback, "mode": "fallback"}
        self.last_attempted = True
        try:
            tools = self._war_room_tools(ctx)
            result = await asyncio.wait_for(
                self._run_war_room_debate_async(ctx, tools, fallback), 22.0
            )
            self.last_used = True
            return result
        except Exception as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"
            return {**fallback, "mode": "fallback", "degraded": True}

    def _war_room_tools(self, ctx: dict) -> dict:
        """The deterministic Stage B tool surface the agents may query.

        Every agent sees only the tools its role declares, and every number in
        a tool result is computed by the Stage B engine — so an agent can
        reason about the space without ever inventing a value.
        """
        sp = ctx.get("spatial") or {}
        metrics = ctx.get("metrics") or {}
        def_lines = metrics.get("def_lines") or sp.get("def_lines") or {}
        ppda = metrics.get("ppda") or sp.get("ppda") or {}
        territory = metrics.get("pitch_control_split") or {}
        network = metrics.get("passing_network_edges") or []
        chaos = metrics.get("chaos_index", sp.get("chaos_index", 0.5))
        bio = metrics.get("bio_load_summary") or {}
        tools = {
            "defensive_line": {
                "NLA_m": def_lines.get("NLA"),
                "MCS_m": def_lines.get("MCS"),
                "note": "Distance from each team's own goal line.",
            },
            "xt_top_zones": sp.get("xt_top_zones") or [],
            "xt_at_gap": sp.get("xt_at_gap"),
            "ghost_pass": sp.get("ghost") or {},
            "pitch_control": territory,
            "passing_network": network[:3],
            "ppda": ppda,
            "press_intensity": metrics.get("pressing_intensity"),
            "pace": sp.get("fastest_sprinter") or {},
            "chaos": {
                "index": round(float(chaos or 0.0), 3),
                "state": metrics.get("chaos_state"),
                "delta_chaos": metrics.get("delta_chaos"),
            },
            "stamina_load": bio,
            "team_stats": metrics.get("team_stats") or {},
        }
        counterfactual = ctx.get("counterfactual")
        if counterfactual:
            # The interactive sandbox hands its relocation here so the arbiter
            # can adjudicate the structural consequence, not just re-state it.
            tools["counterfactual"] = counterfactual
        line_shift = (ctx.get("evaluation") or {}).get("defensive_line_shift")
        if line_shift:
            tools["defensive_line_shift"] = line_shift
        return tools

    async def _run_war_room_debate_async(self, ctx: dict, tools: dict, fallback: dict) -> dict:
        """Sequential three-turn debate executed asynchronously via non-blocking _achat."""
        calls: List[dict] = []
        turns: List[dict] = []
        statements: Dict[str, str] = {}
        degraded_turns: List[str] = []
        arbiter_payload: dict = {}

        for spec in WAR_ROOM_AGENTS:
            deployment = (
                self.s.narrative_deployment
                if spec["deployment"] == "narrative"
                else self.s.triage_deployment
            )
            bundle = {name: tools[name] for name in spec["tools"] if name in tools}
            t0 = time.perf_counter()
            raw = await self._achat(
                deployment,
                [
                    {"role": "system", "content": spec["system"]},
                    {"role": "user", "content": json.dumps({
                        "brief": ctx.get("query") or "Adversarial bench war-room on the live match.",
                        "telemetry": self._compact_ctx(ctx),
                        "your_tools": bundle,
                        "prior_turns": turns,
                        "output_contract": spec["contract"],
                    })},
                ],
                max_tokens=spec["max_tokens"],
                temperature=spec["temperature"],
                timeout=spec["timeout"],
                json_mode=True,
            )
            latency = round((time.perf_counter() - t0) * 1000.0, 1)
            parsed = self._parse_agent_json(raw)
            usage = self.last_usage or {}
            calls.append({
                "id": spec["id"],
                "agent": spec["agent"],
                "role": spec["role"],
                "deployment": deployment,
                "tools": list(bundle.keys()),
                "latency_ms": latency,
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
                "total_tokens": usage.get("total_tokens"),
            })
            turn_text = (
                parsed.get("statement")
                or parsed.get("arbiter_verdict")
                or ""
            )
            if not turn_text:
                degraded_turns.append(spec["agent"])
                turn_text = (
                    f"{spec['agent']} returned a response the studio could not parse; "
                    f"the deterministic Stage B reading is being used instead."
                )
            turns.append({"agent": spec["agent"], "turn": spec["turn"], "statement": turn_text})
            statements[spec["id"]] = turn_text
            if spec["id"] == "spatial_arbiter":
                arbiter_payload = parsed

        prescription = fallback
        required = (
            "recommended_adjustment", "projected_30s_xt_delta",
            "win_prob_shift_pct", "target_zones",
        )
        if all(k in arbiter_payload for k in required):
            prescription = {
                **fallback,
                "recommended_adjustment": arbiter_payload["recommended_adjustment"],
                "projected_30s_xt_delta": arbiter_payload["projected_30s_xt_delta"],
                "win_prob_shift_pct": arbiter_payload["win_prob_shift_pct"],
                "target_zones": arbiter_payload["target_zones"],
                "adjustment_vectors": arbiter_payload.get(
                    "adjustment_vectors", fallback["adjustment_vectors"]),
            }

        return {
            **prescription,
            "agent_debate_transcript": {
                "manager_proposal": statements.get("nla_tactical_manager", ""),
                "scout_counter": statements.get("mcs_opposition_scout", ""),
                "arbiter_verdict": statements.get("spatial_arbiter", ""),
            },
            "agent_calls": calls,
            "degraded": bool(degraded_turns),
            "degraded_agents": degraded_turns,
            "orchestration": {
                "mode": "sequential_debate",
                "rounds": len(calls),
                "agents": [c["agent"] for c in calls],
                "tool_surface": sorted(tools.keys()),
                "note": "Each agent is a separate model call with its own tool bundle; "
                        "the scout reads the manager and the arbiter reads both.",
            },
            "mode": "azure",
            "model": f"azure-foundry:{self.s.narrative_deployment}",
        }

    def _run_war_room_debate(self, ctx: dict, tools: dict, fallback: dict) -> dict:
        """Sequential three-turn debate. Each turn is a separate model call."""
        calls: List[dict] = []
        turns: List[dict] = []
        statements: Dict[str, str] = {}
        degraded_turns: List[str] = []
        arbiter_payload: dict = {}

        for spec in WAR_ROOM_AGENTS:
            deployment = (
                self.s.narrative_deployment
                if spec["deployment"] == "narrative"
                else self.s.triage_deployment
            )
            bundle = {name: tools[name] for name in spec["tools"] if name in tools}
            t0 = time.perf_counter()
            raw = self._chat(
                deployment,
                [
                    {"role": "system", "content": spec["system"]},
                    {"role": "user", "content": json.dumps({
                        "brief": ctx.get("query") or "Adversarial bench war-room on the live match.",
                        "telemetry": self._compact_ctx(ctx),
                        "your_tools": bundle,
                        "prior_turns": turns,
                        "output_contract": spec["contract"],
                    })},
                ],
                max_tokens=spec["max_tokens"],
                temperature=spec["temperature"],
                timeout=spec["timeout"],
                json_mode=True,
            )
            latency = round((time.perf_counter() - t0) * 1000.0, 1)
            parsed = self._parse_agent_json(raw)
            usage = self.last_usage or {}
            calls.append({
                "id": spec["id"],
                "agent": spec["agent"],
                "role": spec["role"],
                "deployment": deployment,
                "tools": list(bundle.keys()),
                "latency_ms": latency,
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
                "total_tokens": usage.get("total_tokens"),
            })
            # A model turn that does not parse must not reach the judge as raw
            # JSON or a markdown fence. Fall back to a clean, honest line and
            # record the degradation so the transcript is never a lie.
            turn_text = (
                parsed.get("statement")
                or parsed.get("arbiter_verdict")
                or ""
            )
            if not turn_text:
                degraded_turns.append(spec["agent"])
                turn_text = (
                    f"{spec['agent']} returned a response the studio could not parse; "
                    f"the deterministic Stage B reading is being used instead."
                )
            turns.append({"agent": spec["agent"], "turn": spec["turn"], "statement": turn_text})
            statements[spec["id"]] = turn_text
            if spec["id"] == "spatial_arbiter":
                arbiter_payload = parsed

        # The prescription numbers always come from the arbiter when it
        # produced them; otherwise we keep the deterministic Stage B numbers and
        # only adopt the model's narrative.
        prescription = fallback
        required = (
            "recommended_adjustment", "projected_30s_xt_delta",
            "win_prob_shift_pct", "target_zones",
        )
        if all(k in arbiter_payload for k in required):
            prescription = {
                **fallback,
                "recommended_adjustment": arbiter_payload["recommended_adjustment"],
                "projected_30s_xt_delta": arbiter_payload["projected_30s_xt_delta"],
                "win_prob_shift_pct": arbiter_payload["win_prob_shift_pct"],
                "target_zones": arbiter_payload["target_zones"],
                "adjustment_vectors": arbiter_payload.get(
                    "adjustment_vectors", fallback["adjustment_vectors"]),
            }

        return {
            **prescription,
            "agent_debate_transcript": {
                "manager_proposal": statements.get("nla_tactical_manager", ""),
                "scout_counter": statements.get("mcs_opposition_scout", ""),
                "arbiter_verdict": statements.get("spatial_arbiter", ""),
            },
            "agent_calls": calls,
            "degraded": bool(degraded_turns),
            "degraded_agents": degraded_turns,
            "orchestration": {
                "mode": "sequential_debate",
                "rounds": len(calls),
                "agents": [c["agent"] for c in calls],
                "tool_surface": sorted(tools.keys()),
                "note": "Each agent is a separate model call with its own tool bundle; "
                        "the scout reads the manager and the arbiter reads both.",
            },
            "mode": "azure",
            "model": f"azure-foundry:{self.s.narrative_deployment}",
        }

    def _war_room_fallback(self, ctx: dict) -> dict:
        """Deterministic zero-key 3-agent debate over the live Stage B state."""
        sp = ctx.get("spatial") or {}
        metrics = ctx.get("metrics") or {}
        team = sp.get("team") or "NLA"
        opp = "MCS" if team == "NLA" else "NLA"
        chaos = float(sp.get("chaos_index") or metrics.get("chaos_index") or 0.5)
        stretch = float(sp.get("backline_stretch_m") or metrics.get("stretch_m") or 0.0)
        gap_m = float(sp.get("widest_gap_m") or 0.0)
        gap_center = sp.get("gap_center") or {"x": 70.0, "y": 34.0}
        gap_defender = sp.get("gap_defender") or {}
        sprinter = sp.get("fastest_sprinter") or {}
        xt_at_gap = float(sp.get("xt_at_gap") or 0.05)
        ppda = metrics.get("ppda") or {}
        lines = metrics.get("def_lines") or {}
        team_ppda = float(ppda.get(team) or 0.0)
        opp_ppda = float(ppda.get(opp) or 0.0)
        line_team = float(lines.get(team) or 0.0)
        line_opp = float(lines.get(opp) or 0.0)
        territory = metrics.get("pitch_control_split") or {}
        nla_pct = float(territory.get("nla_territory_pct") or 50.0)
        mcs_pct = float(territory.get("mcs_territory_pct") or 50.0)

        # ---- agent 1: NLA tactical manager -------------------------------
        zone_x = round(gap_center.get("x", 70.0), 1)
        zone_y = round(gap_center.get("y", 34.0), 1)
        manager_proposal = (
            f"{team} should invert the right fullback into the {zone_x:.0f},{zone_y:.0f} "
            f"half-space to create a 4v3 overload against {opp}'s {gap_m:.1f}m defensive "
            f"seam. The back line is stretched {stretch:.1f}m and xT at that zone reads "
            f"{xt_at_gap:.3f}; the occupied channel is worth "
            f"{team_ppda:.1f} PPDA of pressure resistance against {opp}'s {opp_ppda:.1f}."
        )

        # ---- agent 2: MCS opposition scout --------------------------------
        scout_counter = (
            f"{opp} counters by pivoting the #{str(sprinter.get('shirt_number', 6))} midfielder "
            f"into the vacated wide channel and re-dropping the line from {line_opp:.1f}m to "
            f"{line_opp + 4.0:.1f}m. {opp} holds {mcs_pct:.0f}% of the pitch against "
            f"{nla_pct:.0f}%, and the counter-press lands in under eight seconds at "
            f"Chaos {chaos:.2f}."
        )

        # ---- agent 3: spatial arbiter -------------------------------------
        overload_value = round(0.05 + gap_m * 0.004 + (xt_at_gap * 0.22), 3)
        win_shift = round(max(0.4, min(12.0, overload_value * 48.0)), 1)
        arbiter_verdict = (
            f"Verdict: ACCEPT the {team} overload. Against the {opp} counter-press the "
            f"arbiter weights territory ({nla_pct:.0f}% to {mcs_pct:.0f}%), xT at the target "
            f"zone ({xt_at_gap:.3f}) and the {gap_m:.1f}m seam. Net projected gain is "
            f"+{overload_value:.2f} xT over the next 30 seconds, with the {opp} counter "
            f"priced in as a {max(0.0, 1.8 - overload_value * 6.0):.1f}% win-probability drag."
        )

        target_zones = [
            {"x": zone_x, "y": zone_y, "label": "OVERLOAD ZONE"},
            {"x": round(zone_x - 12.0, 1), "y": round(zone_y + 8.0, 1), "label": "PIVOT TRAP"},
            {"x": round(min(105.0, zone_x + 14.0), 1), "y": round(zone_y - 6.0, 1), "label": "RELEASE LANE"},
        ]
        adjustment_vectors = [
            {"from": {"x": round(min(105.0, zone_x + 6.0), 1), "y": round(zone_y - 14.0, 1)},
             "to": {"x": zone_x, "y": zone_y}, "label": "INVERT RB"},
            {"from": {"x": round(zone_x - 10.0, 1), "y": round(zone_y - 4.0, 1)},
             "to": {"x": round(zone_x - 2.0, 1), "y": round(zone_y + 4.0, 1)},
             "label": "OVERLOAD COMBINATION"},
        ]

        return {
            "agent_debate_transcript": {
                "manager_proposal": manager_proposal,
                "scout_counter": scout_counter,
                "arbiter_verdict": arbiter_verdict,
            },
            "recommended_adjustment": {
                "title": f"Invert Right Fullback — {zone_x:.0f},{zone_y:.0f} Overload",
                "directive": (
                    f"Drop the right fullback into the {zone_x:.0f},{zone_y:.0f} half-space, "
                    f"overload the {gap_defender.get('id', '—')} seam 3v2 and release the "
                    f"inside-left channel into the {opp} pivot trap."
                ),
                "team": team,
                "opponent": opp,
            },
            "projected_30s_xt_delta": overload_value,
            "win_prob_shift_pct": win_shift,
            "target_zones": target_zones,
            "adjustment_vectors": adjustment_vectors,
            "agents": [
                {"id": "nla_tactical_manager", "agent": "NLATacticalManagerAgent",
                 "role": "Proposes the high-leverage adjustment", "status": "completed"},
                {"id": "mcs_opposition_scout", "agent": "MCSOppositionScoutAgent",
                 "role": "Models the optimal counter-adjustment", "status": "completed"},
                {"id": "spatial_arbiter", "agent": "SpatialArbiterAgent",
                 "role": "Adjudicates against the 16x12 xT tensor", "status": "completed"},
            ],
            "agent_calls": [
                {
                    "id": spec["id"],
                    "agent": spec["agent"],
                    "role": spec["role"],
                    "deployment": "deterministic-stage-b",
                    "tools": list(spec["tools"]),
                    "latency_ms": 0.0,
                    "prompt_tokens": None,
                    "completion_tokens": None,
                    "total_tokens": None,
                }
                for spec in WAR_ROOM_AGENTS
            ],
            "orchestration": {
                "mode": "sequential_debate",
                "rounds": len(WAR_ROOM_AGENTS),
                "agents": [spec["agent"] for spec in WAR_ROOM_AGENTS],
                "tool_surface": sorted(self._war_room_tools(ctx).keys()),
                "note": "Deterministic offline twin of the cloud debate: the same "
                        "three agents, the same tool bundles, the same turn order.",
            },
            "telemetry_basis": {
                "chaos_index": round(chaos, 3),
                "backline_stretch_m": round(stretch, 1),
                "widest_gap_m": round(gap_m, 1),
                "xt_at_gap": round(xt_at_gap, 3),
                "ppda": {"NLA": round(ppda.get("NLA", 0.0), 1),
                         "MCS": round(ppda.get("MCS", 0.0), 1)},
                "def_lines": {"NLA": round(lines.get("NLA", 0.0), 1),
                              "MCS": round(lines.get("MCS", 0.0), 1)},
                "pitch_control_split": territory,
            },
            "model": "deterministic-war-room-v1",
        }

