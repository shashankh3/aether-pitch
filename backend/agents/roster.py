from __future__ import annotations

from typing import Optional

#: The SpatialArbiterAgent's dedicated brief for a single interactive
#: counterfactual scenario (the what-if sandbox), as opposed to the full
#: three-turn debate in ``WAR_ROOM_AGENTS``.
COUNTERFACTUAL_ARBITER = {
    "id": "spatial_arbiter",
    "agent": "SpatialArbiterAgent",
    "role": "Adjudicates an interactive counterfactual against the 16x12 xT tensor",
    "deployment": "narrative",
    "temperature": 0.2,
    "max_tokens": 420,
    "timeout": 6.0,
    "system": (
        "You are the SpatialArbiterAgent. You adjudicate ONE interactive "
        "counterfactual: a judge has physically relocated a player on the "
        "virtual pitch. The Stage B tools give you the server-recomputed "
        "consequences (xT before and after, the pitch-control shift, the "
        "structural vulnerability index). Reason ONLY from those tools. "
        "Write a verdict of at most 3 sentences that states what the "
        "relocation costs the team that made it and how it should be "
        "compensated for. Never state a number that is not in your tools. "
        "Return STRICT JSON only: {\"arbiter_verdict\": \"<verdict>\"}."
    ),
    "contract": "{\"arbiter_verdict\": string}",
}


ARCHETYPES = (
    "counter_overload", "pressing_trap", "inversion",
    "difficult_progression", "threat_surge", "rhythm_shift",
)

#: The adversarial bench war-room roster. Each entry is a separate agent with
#: its own system prompt, its own model deployment, its own Stage B tool
#: bundle and its own turn in the debate. `contract` is the strict JSON shape
#: that agent must return.
WAR_ROOM_AGENTS = (
    {
        "id": "nla_tactical_manager",
        "agent": "NLATacticalManagerAgent",
        "role": "Proposes the high-leverage adjustment",
        "deployment": "narrative",
        "turn": 1,
        "temperature": 0.4,
        "max_tokens": 320,
        "timeout": 6.0,
        "tools": ("defensive_line", "xt_top_zones", "xt_at_gap", "ghost_pass",
                  "pitch_control", "passing_network"),
        "system": (
            "You are the NLATacticalManagerAgent. You are the head coach of NLA. "
            "Using ONLY the Stage B tools provided to you, propose the single "
            "highest-leverage tactical adjustment for NLA right now. Name the "
            "pitch zone with real coordinates, cite the tool values you used, "
            "and justify it against the opponent's shape. You are the FIRST "
            "voice in the debate: you have not seen the other agents yet. "
            "Return STRICT JSON only: {\"statement\": \"<your proposal>\"}."
        ),
        "contract": "{\"statement\": string}",
    },
    {
        "id": "mcs_opposition_scout",
        "agent": "MCSOppositionScoutAgent",
        "role": "Models the opponent's optimal counter",
        "deployment": "triage",
        "turn": 2,
        "temperature": 0.4,
        "max_tokens": 320,
        "timeout": 5.0,
        "tools": ("ppda", "press_intensity", "pace", "chaos", "team_stats"),
        "system": (
            "You are the MCSOppositionScoutAgent. You scout the opponent. "
            "Using ONLY the Stage B tools provided to you, model how MCS would "
            "counter the proposal now in the prior turn, and identify the "
            "spatial risk that would punish it. You are the SECOND voice: read "
            "the prior turn and argue against it using your own tools. "
            "Return STRICT JSON only: {\"statement\": \"<your counter>\"}."
        ),
        "contract": "{\"statement\": string}",
    },
    {
        "id": "spatial_arbiter",
        "agent": "SpatialArbiterAgent",
        "role": "Adjudicates against the 16x12 xT tensor",
        "deployment": "narrative",
        "turn": 3,
        "temperature": 0.2,
        "max_tokens": 620,
        "timeout": 7.0,
        "tools": ("xt_top_zones", "xt_at_gap", "pitch_control", "chaos",
                  "stamina_load", "defensive_line", "counterfactual"),
        "system": (
            "You are the SpatialArbiterAgent. You are the neutral referee of an "
            "adversarial bench war-room. Weigh BOTH prior turns against the "
            "Stage B tools provided to you and the 16x12 Expected Threat tensor. "
            "Issue one final Tactical Prescription. Never invent a number that "
            "is not present in your tools. Return STRICT JSON only with keys: "
            "statement (your verdict), recommended_adjustment (object with title "
            "and directive), projected_30s_xt_delta (number), "
            "win_prob_shift_pct (number), target_zones (array of up to 3 objects "
            "with x, y, label), adjustment_vectors (array of objects with from, "
            "to, label)."
        ),
        "contract": (
            "{\"statement\": string, \"recommended_adjustment\": {\"title\": string, "
            "\"directive\": string}, \"projected_30s_xt_delta\": number, "
            "\"win_prob_shift_pct\": number, \"target_zones\": [{\"x\": number, "
            "\"y\": number, \"label\": string}], \"adjustment_vectors\": [{\"from\": "
            "{\"x\": number, \"y\": number}, \"to\": {\"x\": number, \"y\": number}, "
            "\"label\": string}]}"
        ),
    },
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
