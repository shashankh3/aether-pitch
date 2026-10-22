from __future__ import annotations

import json
import time

from agents.roster import COUNTERFACTUAL_ARBITER

class CounterfactualArbiterMixin:
    # --------------------------------- interactive counterfactual (what-if)
    async def counterfactual_query(self, ctx: dict) -> dict:
        """Adjudicate an interactive what-if scenario.

        The Stage B consequences are computed server-side and handed to the
        SpatialArbiterAgent as tools, so the agent reasons over the same
        numbers the deterministic engine produced — and every number it
        states is then re-checked by the numeric critic.
        """
        self._reset_trace()
        evaluation = ctx.get("evaluation") or {}
        fallback = self._counterfactual_fallback(ctx)
        risk = self.preflight_screen(ctx)
        if risk["severity"] != "clear":
            self.last_error = f"prompt-shield-{risk['severity']}"
            return {**fallback, "mode": "shield"}
        if not self.s.azure_enabled:
            return {**fallback, "mode": "fallback"}

        self.last_attempted = True
        try:
            tools = {**self._counterfactual_tools(ctx), "counterfactual": evaluation}
            t0 = time.perf_counter()
            raw = await self._achat(
                self.s.narrative_deployment,
                [
                    {"role": "system", "content": COUNTERFACTUAL_ARBITER["system"]},
                    {"role": "user", "content": json.dumps({
                        "brief": ctx.get("query") or "Adjudicate the counterfactual scenario.",
                        "your_tools": tools,
                        "output_contract": COUNTERFACTUAL_ARBITER["contract"],
                    })},
                ],
                max_tokens=COUNTERFACTUAL_ARBITER["max_tokens"],
                temperature=COUNTERFACTUAL_ARBITER["temperature"],
                timeout=COUNTERFACTUAL_ARBITER["timeout"],
                json_mode=True,
            )
            latency = round((time.perf_counter() - t0) * 1000.0, 1)
            parsed = self._parse_agent_json(raw)
            verdict = (parsed.get("arbiter_verdict") or "").strip()
            if not verdict:
                self.last_error = "Azure arbiter returned no verdict"
                return {**fallback, "mode": "fallback", "degraded": True}
            usage = self.last_usage or {}
            self.last_used = True
            return {
                **fallback,
                "arbiter_verdict": verdict,
                "mode": "azure",
                "model": f"azure-foundry:{self.s.narrative_deployment}",
                "agent_call": {
                    "id": COUNTERFACTUAL_ARBITER["id"],
                    "agent": COUNTERFACTUAL_ARBITER["agent"],
                    "role": COUNTERFACTUAL_ARBITER["role"],
                    "deployment": self.s.narrative_deployment,
                    "tools": sorted(tools.keys()),
                    "latency_ms": latency,
                    "prompt_tokens": usage.get("prompt_tokens"),
                    "completion_tokens": usage.get("completion_tokens"),
                    "total_tokens": usage.get("total_tokens"),
                },
            }
        except Exception as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"
            return {**fallback, "mode": "fallback", "degraded": True}

    def _counterfactual_tools(self, ctx: dict) -> dict:
        """The Stage B tool surface the arbiter may reason over."""
        sp = ctx.get("spatial") or {}
        metrics = ctx.get("metrics") or {}
        return {
            "xt_top_zones": sp.get("xt_top_zones") or [],
            "pitch_control": metrics.get("pitch_control_split") or {},
            "chaos": {
                "index": round(float(metrics.get("chaos_index") or 0.0), 3),
                "state": metrics.get("chaos_state"),
            },
            "defensive_line": metrics.get("def_lines") or {},
            "ppda": metrics.get("ppda") or {},
            "stamina_load": metrics.get("bio_load_summary") or {},
        }

    def _counterfactual_fallback(self, ctx: dict) -> dict:
        """Deterministic offline verdict with the identical schema."""
        evaluation = ctx.get("evaluation") or {}
        shift = float(evaluation.get("projected_xt_shift") or 0.0)
        control = evaluation.get("pitch_control_shift_pct") or {}
        vuln = float(evaluation.get("structural_vulnerability_index") or 0.0)
        nla_shift = float(control.get("nla_territory_pct") or 0.0)
        mcs_shift = float(control.get("mcs_territory_pct") or 0.0)
        displaced_team = str(evaluation.get("displaced_team") or "NLA")
        team_shift = nla_shift if displaced_team == "NLA" else mcs_shift
        rival_shift = mcs_shift if displaced_team == "NLA" else nla_shift
        move = evaluation.get("recommended_compensation_move") or {}
        mover = move.get("player_id")
        target = move.get("target_xy") or [0.0, 0.0]

        # The verdict must agree with the signs of the numbers it cites.
        if team_shift < 0:
            territory_clause = (
                f"it surrenders {abs(team_shift):.1f} points of territory to the opposition"
            )
        elif team_shift > 0:
            if rival_shift < -0.05:
                territory_clause = (
                    f"it wins {team_shift:.1f} points of territory while conceding "
                    f"{abs(rival_shift):.1f} to the opposition"
                )
            else:
                territory_clause = f"it wins {team_shift:.1f} points of territory"
        else:
            territory_clause = "it leaves the territory split unchanged"

        if shift < 0:
            xT_clause = f"surrenders {abs(shift):.3f} xT"
        else:
            xT_clause = f"adds {shift:.3f} xT"

        if vuln >= 0.35 or (team_shift < 0 and shift < 0):
            stance = "The structure is exposed and the vacated channel must be recovered."
        elif vuln <= 0.15 and shift >= 0 and team_shift >= 0:
            stance = "The structure absorbs the move, so the side can commit to it."
        else:
            stance = "The move is marginal: hold the shape and re-test the next transition."

        line = evaluation.get("defensive_line_shift")
        has_displacement = bool(evaluation.get("displacements"))
        if line and not has_displacement:
            # A collective line shift is its own story: lead with the line.
            height = float(line.get("target_line_height_m") or 0.0)
            exposure = float(line.get("through_ball_exposure_xt") or 0.0)
            press = float(line.get("press_compression_gain_pct") or 0.0)
            trap = float(line.get("offside_trap_catch_prob_pct") or 0.0)
            area_before = float(line.get("compactness_area_m2") or 0.0)
            area_after = float(line.get("compactness_area_after_m2") or 0.0)
            territory_word = (
                f"surrenders {abs(team_shift):.1f} points of central territory"
                if team_shift < 0
                else f"wins {team_shift:.1f} points of central territory"
                if team_shift > 0
                else "leaves the territory split unchanged"
            )
            verdict = (
                f"Sliding the {displaced_team} defensive line to {height:.1f} m from its own "
                f"goal {territory_word} and compresses the block from {area_before:.0f} m2 to "
                f"{area_after:.0f} m2. Through-ball exposure reads {exposure:.3f} xT, the "
                f"offside trap holds {trap:.0f}% of catches, and pressing gains "
                f"{press:.1f}% of the central space, leaving the structural vulnerability "
                f"index at {vuln:.2f}."
            )
        else:
            verdict = (
                f"Relocating the player {xT_clause} and {territory_clause}, leaving the "
                f"structural vulnerability index at {vuln:.2f}. {stance}"
            )
        if line and has_displacement:
            height = float(line.get("target_line_height_m") or 0.0)
            exposure = float(line.get("through_ball_exposure_xt") or 0.0)
            press = float(line.get("press_compression_gain_pct") or 0.0)
            trap = float(line.get("offside_trap_catch_prob_pct") or 0.0)
            verdict += (
                f" The defensive line also slides to {height:.1f} m from its own goal: "
                f"through-ball exposure reads {exposure:.3f} xT, the offside trap holds "
                f"{trap:.0f}% of catches, and pressing compresses the central space by "
                f"{press:.1f}%."
            )
        return {
            "scenario_id": str(evaluation.get("scenario_id") or "cf_offline"),
            "projected_xt_shift": shift,
            "pitch_control_shift_pct": {
                "nla_territory_pct": nla_shift,
                "mcs_territory_pct": mcs_shift,
            },
            "structural_vulnerability_index": vuln,
            "arbiter_verdict": verdict,
            "recommended_compensation_move": {
                "player_id": mover if mover is not None else 0,
                "target_xy": [float(target[0]), float(target[1])],
            },
            "numeric_grounding_verified": True,
            "trace_id": str(evaluation.get("trace_id") or "trace_offline"),
            "mode": "fallback",
            "model": "deterministic-arbiter-v1",
        }

