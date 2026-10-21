"""
AETHER PITCH — Interactive counterfactual "what-if" contracts and evaluation.

This module holds the wire contract (Pydantic models) and the deterministic
Stage B evaluation of a what-if scenario. It is deliberately free of module
globals: everything it needs arrives as an argument, so the maths can be
unit-tested in isolation and reasoned about without reading `main.py`.

The client's baseline values are never trusted for the arithmetic. Every
number is recomputed here from the live Stage B engine, so a manipulated
request cannot inflate the result; the client baseline is only a cross-check.
"""
from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

PITCH_L = 105.0


class CounterfactualDisplacement(BaseModel):
    """One player relocated by the interactive sandbox."""

    player_id: int = Field(
        description="Shirt number of the displaced player.",
        ge=0, le=99,
    )
    canonical_player_id: Optional[str] = Field(
        default=None,
        description="Resolved engine id (e.g. 'NLA_2'). Preferred over player_id.",
    )
    team: str = Field(description="NLA or MCS.")
    role: str = Field(description="GK | DEF | MID | FWD.")
    original_coords: Tuple[float, float] = Field(
        description="Where the player stood, in absolute pitch metres (x, y).")
    displaced_coords: Tuple[float, float] = Field(
        description="Where the judge dragged them to, in absolute pitch metres (x, y).")
    delta_distance_m: float = Field(
        description="Euclidean displacement in metres.", ge=0.0)


class DefensiveLineOverride(BaseModel):
    """A collective defensive line shift for one team."""

    team: str = Field(description="NLA or MCS.")
    original_height_m: float = Field(
        description="The line height before the shift, in metres from the team's own goal line.",
        ge=0.0, le=80.0)
    target_height_m: float = Field(
        description="The requested line height, clamped to [18.0, 52.0] metres.",
        ge=0.0, le=80.0)


class CounterfactualRequest(BaseModel):
    """A full sandbox scenario submitted for arbitration."""

    match_id: str = Field(description="Synthetic match id.")
    minute: float = Field(description="Match minute of the scenario.")
    displacements: List[CounterfactualDisplacement] = Field(
        description="Every player relocated in this scenario.")
    baseline_xt: float = Field(
        description="Client-side xT at the original position.")
    baseline_pitch_control: Dict[str, float] = Field(
        description="Client-side baseline territory split.")
    current_chaos_index: float = Field(
        description="Chaos Index at the moment of the scenario.", ge=0.0, le=1.0)
    defensive_line_override: Optional[DefensiveLineOverride] = Field(
        default=None,
        description="Optional collective defensive line shift for one team.")


class CounterfactualEvaluation(BaseModel):
    """The SpatialArbiterAgent's adjudicated verdict."""

    scenario_id: str
    projected_xt_shift: float
    pitch_control_shift_pct: Dict[str, float]
    structural_vulnerability_index: float = Field(ge=0.0, le=1.0)
    arbiter_verdict: str
    recommended_compensation_move: Dict[str, Any]
    numeric_grounding_verified: bool
    trace_id: str


class CounterfactualRejected(Exception):
    """Raised when a scenario cannot be evaluated against the live state."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def resolve_sandbox_player(
    state: dict,
    player_id: int,
    canonical: Optional[str],
    team: str,
) -> Optional[dict]:
    """Resolve a sandbox displacement to a live player.

    The wire contract carries the shirt number; the engine speaks canonical
    ids such as ``NLA_2``. A canonical id is preferred when supplied.
    """
    players = state.get("players", [])
    if canonical:
        for p in players:
            if p.get("id") == canonical:
                return p
    for p in players:
        if p.get("team") == team and int(p.get("shirt_number", -1)) == int(player_id):
            return p
    return None


def line_shift_overrides(
    state: dict,
    team: str,
    delta_m: float,
) -> List[dict]:
    """Player overrides that reproduce a collective defensive line shift.

    The backline slides by `delta_m` and the midfield compresses by
    0.45 x `delta_m` — the same topology the Stage B evaluator applies.
    """
    sign = 1.0 if team == "NLA" else -1.0
    outfield = [p for p in state.get("players", [])
                if p.get("team") == team and p.get("role") != "GK"]
    if not outfield:
        return []
    depth = (lambda p: float(p.get("x", 0.0)) if team == "NLA"
             else PITCH_L - float(p.get("x", 0.0)))
    by_depth = sorted(outfield, key=depth)
    backline_ids = {p.get("id") for p in by_depth[:4]}
    midfield_ids = {p.get("id") for p in by_depth[4:8]}
    overrides: List[dict] = []
    for p in outfield:
        pid = p.get("id")
        if pid in backline_ids:
            overrides.append({
                "player_id": pid,
                "x": float(p.get("x", 0.0)) + sign * delta_m,
                "y": float(p.get("y", 34.0)),
            })
        elif pid in midfield_ids:
            overrides.append({
                "player_id": pid,
                "x": float(p.get("x", 0.0)) + sign * delta_m * 0.45,
                "y": float(p.get("y", 34.0)),
            })
    return overrides


def compensation_move(resolved: List[dict], state: dict) -> dict:
    """Propose who should cover the vacated channel, and where."""
    if not resolved:
        return {"player_id": 0, "target_xy": [0.0, 0.0]}
    primary = resolved[0]
    vacated = primary["original_coords"]
    team = primary["team"]
    team_players = [
        p for p in state.get("players", [])
        if p.get("team") == team and p.get("role") != "GK"
        and p.get("id") != primary["canonical_player_id"]
    ]
    if not team_players:
        return {
            "player_id": primary["player_id"],
            "target_xy": [float(vacated[0]), float(vacated[1])],
        }
    coverer = min(
        team_players,
        key=lambda p: ((float(p.get("x", 0.0)) - float(vacated[0])) ** 2
                       + (float(p.get("y", 0.0)) - float(vacated[1])) ** 2) ** 0.5,
    )
    return {
        "player_id": int(coverer.get("shirt_number", 0)),
        "target_xy": [float(vacated[0]), float(vacated[1])],
        "label": "COVER VACATED CHANNEL",
    }


def line_compensation_move(state: dict, team: str, line_shift: dict) -> dict:
    """Compensation for a line shift: the most advanced midfielder drops back."""
    outfield = [p for p in state.get("players", [])
                if p.get("team") == team and p.get("role") not in ("GK", "DEF")]
    if not outfield:
        return {"player_id": 0, "target_xy": [0.0, 0.0],
                "label": "HOLD THE SHAPE"}
    sign = 1.0 if team == "NLA" else -1.0
    dropper = max(
        outfield,
        key=lambda p: float(p.get("x", 0.0)) if team == "NLA" else PITCH_L - float(p.get("x", 0.0)),
    )
    x = float(dropper.get("x", 0.0)) - sign * 6.0
    return {
        "player_id": int(dropper.get("shirt_number", 0)),
        "target_xy": [round(x, 1), round(float(dropper.get("y", 34.0)), 1)],
        "label": "DROP THE MIDFIELD BLOCK",
    }


def evaluate_counterfactual(
    req: CounterfactualRequest,
    state: dict,
    metrics: dict,
    math_engine,
) -> dict:
    """Server-authoritative Stage B evaluation of a what-if scenario.

    `math_engine` is the live `TacticalMathEngine`. Every shift is recomputed
    from it; the client baseline is only a cross-check.
    """
    if not state:
        raise CounterfactualRejected(503, "Match engine not started yet")
    if not req.displacements and req.defensive_line_override is None:
        raise CounterfactualRejected(
            400,
            "at least one displacement or a defensive line override is required",
        )

    resolved: List[dict] = []
    overrides: List[dict] = []
    for d in req.displacements:
        player = resolve_sandbox_player(
            state, d.player_id, d.canonical_player_id, d.team)
        if player is None:
            raise CounterfactualRejected(
                404,
                f"player {d.player_id} ({d.team}) not found in the live state",
            )
        ox, oy = float(d.original_coords[0]), float(d.original_coords[1])
        nx, ny = float(d.displaced_coords[0]), float(d.displaced_coords[1])
        team = player.get("team") or d.team
        xt_before = float(math_engine.xt_value(team, ox, oy))
        xt_after = float(math_engine.xt_value(team, nx, ny))
        resolved.append({
            "player_id": int(player.get("shirt_number", d.player_id)),
            "canonical_player_id": player.get("id"),
            "player_name": player.get("name"),
            "team": team,
            "role": player.get("role") or d.role,
            "original_coords": [round(ox, 2), round(oy, 2)],
            "displaced_coords": [round(nx, 2), round(ny, 2)],
            "delta_distance_m": round(((nx - ox) ** 2 + (ny - oy) ** 2) ** 0.5, 2),
            "xt_before": round(xt_before, 4),
            "xt_after": round(xt_after, 4),
            "xt_shift": round(xt_after - xt_before, 4),
        })
        overrides.append({"player_id": player.get("id"), "x": nx, "y": ny})

    baseline_control = math_engine.pitch_control_split(state)
    simulated_control = math_engine.pitch_control_split(state, overrides)
    control_shift = {
        "nla_territory_pct": round(
            simulated_control["nla_territory_pct"] - baseline_control["nla_territory_pct"], 1),
        "mcs_territory_pct": round(
            simulated_control["mcs_territory_pct"] - baseline_control["mcs_territory_pct"], 1),
    }
    projected_xt_shift = round(sum(r["xt_shift"] for r in resolved), 4)

    # -- structural vulnerability index [0, 1] ---------------------------
    # A transparent composite: how much territory the relocating side gives
    # up, how much xT it surrenders by vacating the space, and how stretched
    # the structure becomes.
    territory_loss = 0.0
    xt_surrendered = 0.0
    stretch = 0.0
    for r in resolved:
        key = "nla_territory_pct" if r["team"] == "NLA" else "mcs_territory_pct"
        territory_loss += max(0.0, -float(control_shift.get(key, 0.0)))
        xt_surrendered += max(0.0, -r["xt_shift"])
        stretch += r["delta_distance_m"]
    vulnerability = round(min(
        1.0,
        0.45 * min(1.0, territory_loss / 8.0)
        + 0.35 * min(1.0, xt_surrendered / 0.06)
        + 0.20 * min(1.0, stretch / 40.0),
    ), 4)

    comp = compensation_move(resolved, state)

    # -- optional collective defensive line shift -----------------------
    line_shift = None
    if req.defensive_line_override is not None:
        override = req.defensive_line_override
        line_shift = math_engine.evaluate_defensive_line_shift(
            state, override.team, override.target_height_m)
        line_shift["requested_original_height_m"] = round(
            float(override.original_height_m), 1)
        line_shift["line_delta_applied_m"] = line_shift["delta_m"]
        shifted_overrides = line_shift_overrides(
            state, override.team, line_shift["delta_m"])
        if shifted_overrides:
            simulated_control = math_engine.pitch_control_split(state, shifted_overrides)
            control_shift = {
                "nla_territory_pct": round(
                    simulated_control["nla_territory_pct"]
                    - baseline_control["nla_territory_pct"], 1),
                "mcs_territory_pct": round(
                    simulated_control["mcs_territory_pct"]
                    - baseline_control["mcs_territory_pct"], 1),
            }
        comp = line_compensation_move(state, override.team, line_shift)

    scenario_id = "cf_" + hashlib.sha1(
        (
            f"{req.match_id}:{req.minute}:"
            + ";".join(f"{r['canonical_player_id']}@{r['displaced_coords']}" for r in resolved)
        ).encode("utf-8")
    ).hexdigest()[:10]

    return {
        "scenario_id": scenario_id,
        "match_id": req.match_id,
        "minute": req.minute,
        "displacements": resolved,
        "displaced_team": resolved[0]["team"] if resolved else "NLA",
        "defensive_line_shift": line_shift,
        "projected_xt_shift": projected_xt_shift,
        "pitch_control_shift_pct": control_shift,
        "baseline_pitch_control": baseline_control,
        "simulated_pitch_control": simulated_control,
        "structural_vulnerability_index": vulnerability,
        "recommended_compensation_move": comp,
        "current_chaos_index": round(float(metrics.get("chaos_index") or 0.0), 3),
        "client_baseline_xt": round(float(req.baseline_xt), 4),
        "client_baseline_pitch_control": req.baseline_pitch_control or {},
        "baseline_matched": (
            abs(float(req.baseline_xt) - projected_xt_shift) < 0.25
            and abs(
                float((req.baseline_pitch_control or {}).get("nla_territory_pct", 0.0))
                - control_shift.get("nla_territory_pct", 0.0)
            ) < 6.0
        ),
    }
