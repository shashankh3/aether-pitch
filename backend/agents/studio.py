from __future__ import annotations

import asyncio
import json
import re

class StudioQueryMixin:
    # ---------------------------------------------------- bi-directional co-pilot
    async def studio_query(self, ctx: dict) -> dict:
        """'Ask The 12th Man' — bi-directional agentic studio co-pilot.

        ctx: {query, language, persona, locked_player_id, spatial: {...computed
        live 60s spatial state...}, recent_events, metrics}
        Returns the strict StudioQueryResponse schema with a scene_directive
        that physically drives the 3D pitch / camera / telestrator overlays.
        """
        self._reset_trace()
        fallback = self._studio_query_fallback(ctx)
        # ---- PRE-FLIGHT shield ------------------------------------------
        # A blocked or off-topic query never reaches the model: no token is
        # sent to Azure OpenAI, and the caller gets a grounded deflection
        # back to the live synthetic match.
        risk = self.preflight_screen(ctx)
        if risk["severity"] != "clear":
            self.last_error = f"prompt-shield-{risk['severity']}"
            return self.apply_safety_shield(
                {**fallback, "mode": "shield"}, ctx, fallback=fallback)
        if self.s.azure_enabled:
            self.last_attempted = True
            try:
                raw = await asyncio.wait_for(
                    self._azure_studio_query_async(ctx, fallback), 6.0
                )
                # structural guard: fall back if the model dropped required keys
                required = ("agent_reasoning_chain", "studio_answer_localized",
                            "commentator_cue_15s", "scene_directive",
                            "answer", "agent_specialist", "grounding_citations",
                            "suggested_actions")
                if all(k in raw for k in required):
                    raw.setdefault("query", ctx.get("query", ""))
                    raw.setdefault("model", f"azure-foundry:{self.s.narrative_deployment}")
                    raw.setdefault("mode", "azure")
                    raw["scene_directive"] = {**fallback["scene_directive"], **raw["scene_directive"]}
                    self.last_used = True
                    return self.apply_safety_shield(raw, ctx, fallback=fallback)
                self.last_error = "Azure response missed required schema keys"
            except Exception as exc:
                self.last_error = f"{type(exc).__name__}: {exc}"
        return self.apply_safety_shield(
            {**fallback, "mode": "fallback"}, ctx, fallback=fallback)

    async def _azure_studio_query_async(self, ctx: dict, fallback: dict) -> dict:
        raw = await self._achat(
            self.s.narrative_deployment,
            [{"role": "system", "content":
              "You are The 12th Man, an agentic broadcast studio co-pilot wired into a live "
              "3D tactical engine. Given the query and the live 60s spatial telemetry, return "
              "STRICT JSON only (no markdown) with keys: "
              "answer (the same 2-3 sentence answer in the requested language), "
              "agent_specialist (one of Match Analyst, Spatial Analyst, Ghost-Pass Counterfactual, Story Director), "
              "grounding_citations (array of 2-3 objects with label, value, source, detail), "
              "suggested_actions (array of 2-3 objects with id, label, type, payload, reason; type in "
              "[FOCUS_GAP, LOCK_PLAYER, SHOW_GHOST_PASS, GENERATE_RECAP]), "
              "agent_reasoning_chain (array of exactly 3 short reasoning steps citing the numbers), "
              "studio_answer_localized (2-3 sentences in the requested language), "
              "commentator_cue_15s (one punchy 15-second commentator line), "
              "scene_directive (object with keys camera_mode in [TELE_BROADCAST, TACTICAL_DRONE, "
              "PLAYER_LOCK_3RD_PERSON, ACTION_ZOOM], spotlight_player_ids (<=3 ids), "
              "enable_offside_wall (bool), enable_compactness_polygon (bool), draw_ghost_pass (bool), "
              "highlight_pitch_zone ({x_min,x_max,y_min,y_max,label}) using the provided spatial stats."},
             {"role": "user", "content": json.dumps(self._compact_ctx(ctx))}],
            max_tokens=550, temperature=0.4, timeout=5.0, json_mode=True,
        )
        cleaned = re.sub(r"^```(json)?|```$", "", (raw or "").strip(), flags=re.M).strip()
        return json.loads(cleaned)

    def _azure_studio_query(self, ctx: dict, fallback: dict) -> dict:
        raw = self._chat(
            self.s.narrative_deployment,
            [{"role": "system", "content":
              "You are The 12th Man, an agentic broadcast studio co-pilot wired into a live "
              "3D tactical engine. Given the query and the live 60s spatial telemetry, return "
              "STRICT JSON only (no markdown) with keys: "
              "answer (the same 2-3 sentence answer in the requested language), "
              "agent_specialist (one of Match Analyst, Spatial Analyst, Ghost-Pass Counterfactual, Story Director), "
              "grounding_citations (array of 2-3 objects with label, value, source, detail), "
              "suggested_actions (array of 2-3 objects with id, label, type, payload, reason; type in "
              "[FOCUS_GAP, LOCK_PLAYER, SHOW_GHOST_PASS, GENERATE_RECAP]), "
              "agent_reasoning_chain (array of exactly 3 short reasoning steps citing the numbers), "
              "studio_answer_localized (2-3 sentences in the requested language), "
              "commentator_cue_15s (one punchy 15-second commentator line), "
              "scene_directive (object with keys camera_mode in [TELE_BROADCAST, TACTICAL_DRONE, "
              "PLAYER_LOCK_3RD_PERSON, ACTION_ZOOM], spotlight_player_ids (<=3 ids), "
              "enable_offside_wall (bool), enable_compactness_polygon (bool), draw_ghost_pass (bool), "
              "highlight_pitch_zone ({x_min,x_max,y_min,y_max,label}) using the provided spatial stats."},
             {"role": "user", "content": json.dumps(self._compact_ctx(ctx))}],
            max_tokens=550, temperature=0.4, timeout=5.0, json_mode=True,
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
        q = (ctx.get("query") or "").lower()
        if any(k in q for k in ("ghost", "what if", "counterfactual", "alternative", "instead")):
            specialist = "Ghost-Pass Counterfactual"
        elif any(k in q for k in ("gap", "seam", "space", "press", "block", "line")):
            specialist = "Spatial Analyst"
        elif any(k in q for k in ("recap", "story", "momentum", "narrative", "halftime")):
            specialist = "Story Director"
        else:
            specialist = "Match Analyst"
        ghost_delta = float(ghost.get("delta_xt") or 0.0)
        net_gain = float(ghost.get("net_xt_gain") or ghost_delta)
        completion = float(ghost.get("completion_probability") or 0.0)
        target_id = ghost.get("target_id") or "—"

        chain = [
            (f"Scanned {team} back-line coordinates: lateral stretch is {stretch:.1f}m "
             f"(threshold: 30.0m); widest seam between defenders is {gap_m:.1f}m."),
            (f"Isolated the void at pitch zone ({gap_center['x']:.1f}, {gap_center['y']:.1f}) — "
             f"left exposed by {gap_defender.get('name', 'the far-sided defender')} "
             f"({gap_defender.get('id', '—')}) stepping inside."),
            (f"Cross-referenced {opp} runners: #{sprinter.get('shirt_number', '—')} "
             f"{sprinter.get('name', '—')} is the fastest threat at "
             f"{sprinter.get('speed_kmh', 0.0):.1f} km/h attacking that channel"
             + (f"; ghost lane to {target_id} gains +{net_gain:.2f} xT at "
                f"{completion:.0f}% completion." if ghost else "."))
        ]

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
        if specialist == "Story Director":
            answers = {
                "en": (f"The live story is space: {team}'s {stretch:.1f} m back line is opening a "
                       f"{gap_m:.1f} m seam, while {opp}'s fastest runner is already at "
                       f"{sprinter.get('speed_kmh', 0):.1f} km/h. That is the tension the recap should build around."),
                "es": (f"La historia en vivo es el espacio: la línea de {team} se estira {stretch:.1f} m "
                       f"y abre una brecha de {gap_m:.1f} m, mientras el corredor más rápido de {opp} "
                       f"ya va a {sprinter.get('speed_kmh', 0):.1f} km/h. Ese es el hilo del resumen."),
                "ar": (f"القصة الحية هي المساحة: خط {team} يمتد {stretch:.1f} متراً ويفتح فجوة "
                       f"{gap_m:.1f} متر، بينما أسرع لاعب في {opp} ينطلق بسرعة "
                       f"{sprinter.get('speed_kmh', 0):.1f} كم/س. هذا هو محور الملخص."),
                "hi": (f"लाइव कहानी जगह की है: {team} की बैक-लाइन {stretch:.1f} m फैलकर "
                       f"{gap_m:.1f} m की खाई बना रही है, जबकि {opp} का सबसे तेज़ रनर "
                       f"{sprinter.get('speed_kmh', 0):.1f} km/h पर है। रीकैप इसी तनाव पर बनेगा।"),
            }
        if ghost:
            suffix = {
                "en": (f" Best counterfactual: the ghost lane to {target_id} gains "
                       f"+{net_gain:.2f} xT with {completion:.0f}% completion."),
                "es": (f" Mejor contrafactual: el pase fantasma a {target_id} gana "
                       f"+{net_gain:.2f} xT con {completion:.0f}% de finalización."),
                "ar": (f" أفضل سيناريو بديل: المسار الوهمي إلى {target_id} يضيف "
                       f"+{net_gain:.2f} xT بنسبة إتمام {completion:.0f}%."),
                "hi": (f" बेहतर काउंटरफैक्चुअल: {target_id} तक घोस्ट पास "
                       f"+{net_gain:.2f} xT और {completion:.0f}% पूर्णता दर देता है।"),
            }
            answers = {k: v + suffix.get(k, suffix["en"]) for k, v in answers.items()}

        citations = [
            {"label": "Back-line stretch", "value": f"{stretch:.1f} m",
             "source": "Stage B · defensive-line geometry",
             "detail": f"Lateral span of the {team} back line across the live 60s window."},
            {"label": "Widest seam", "value": f"{gap_m:.1f} m",
             "source": "Stage B · gap detector",
             "detail": f"Open corridor at ({gap_center['x']:.1f}, {gap_center['y']:.1f})."},
        ]
        citations.append(
            {"label": "Ghost-pass gain", "value": f"+{net_gain:.2f} xT",
             "source": "Stage B · counterfactual engine",
             "detail": f"Target {target_id} at {completion:.0f}% completion."}
            if ghost else
            {"label": "Fastest channel runner", "value": f"{sprinter.get('speed_kmh', 0):.1f} km/h",
             "source": "Stage A · tracking telemetry",
             "detail": f"#{sprinter.get('shirt_number', '—')} {sprinter.get('name', '—')} attacking the seam."}
        )
        actions = []
        if ghost:
            actions.append({
                "id": "ghost-pass", "label": "Run ghost pass",
                "type": "SHOW_GHOST_PASS", "payload": {"enabled": True},
                "reason": f"+{net_gain:.2f} xT alternative at {completion:.0f}% completion.",
            })
        else:
            actions.append({
                "id": "focus-gap", "label": "Focus the gap",
                "type": "FOCUS_GAP",
                "payload": {"camera_mode": "TACTICAL_DRONE", "zone": {
                    "x": gap_center["x"], "y": gap_center["y"]}},
                "reason": f"Widest seam is {gap_m:.1f} m.",
            })
        if sprinter.get("id"):
            actions.append({
                "id": "lock-runner", "label": f"Lock #{sprinter.get('shirt_number', '—')}",
                "type": "LOCK_PLAYER",
                "payload": {"player_id": sprinter.get("id"),
                            "player_name": sprinter.get("name")},
                "reason": f"{sprinter.get('speed_kmh', 0):.1f} km/h run into the seam.",
            })
        actions.append({
            "id": "build-recap", "label": "Build 3-act recap",
            "type": "GENERATE_RECAP", "payload": {"focus": "defensive_seam"},
            "reason": "Turn the live spatial tension into a cumulative storyboard.",
        })

        zone_half_x, zone_half_y = max(8.0, gap_m * 0.6), max(7.0, gap_m * 0.5)
        return {
            "query": ctx.get("query", ""),
            "answer": answers.get(language, answers["en"]),
            "agent_specialist": specialist,
            "grounding_citations": citations[:3],
            "suggested_actions": actions[:3],
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
